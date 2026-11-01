<?php

namespace App\Http\Controllers;

use App\Models\AdminAuditLog;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AdminStaffController extends Controller
{
    public function index(Request $request)
    {
        $this->authorizeStaffManagement($request);

        $staff = User::query()
            ->where('role', 'admin')
            ->select(['id', 'name', 'phone', 'admin_role', 'admin_active', 'created_at'])
            ->orderBy('name')
            ->orderBy('id')
            ->paginate(30);

        return response()->json([
            'data' => $staff->getCollection()->map(fn (User $member) => [
                'id' => $member->id,
                'name' => $member->name,
                'phone' => $member->phone,
                'admin_role' => $member->admin_role ?? 'support',
                'admin_active' => (bool) $member->admin_active,
                'created_at' => $member->created_at,
            ]),
            'current_page' => $staff->currentPage(),
            'last_page' => $staff->lastPage(),
            'total' => $staff->total(),
        ]);
    }

    public function store(Request $request)
    {
        $this->authorizeStaffManagement($request);

        $validated = $request->validate([
            'phone' => ['required', 'string', 'regex:/^[0-9]{10,15}$/', Rule::unique('users', 'phone')],
            'admin_role' => ['sometimes', 'string', Rule::in(User::ADMIN_ROLES)],
        ]);
        $adminRole = $validated['admin_role'] ?? 'support';

        $staff = DB::transaction(function () use ($request, $validated, $adminRole) {
            $actor = User::query()
                ->whereKey($request->user()->id)
                ->lockForUpdate()
                ->firstOrFail();
            abort_if(! $actor->hasAdminPermission('staff.manage'), 403, 'Only Super Admins can manage administrator access.');

            $staff = User::query()->create([
                'phone' => $validated['phone'],
                'role' => 'admin',
                'admin_role' => $adminRole,
                'admin_active' => true,
                'status' => 'active',
            ]);

            AdminAuditLog::record(
                $actor,
                'admin.invited',
                'user',
                $staff->id,
                'Invited admin #'.$staff->id.' as '.$adminRole.'.',
            );

            return $staff;
        });

        return response()->json([
            'message' => 'Administrator account created. They can use Forgot password to verify their phone and set an initial password.',
            'staff' => [
                'id' => $staff->id,
                'phone' => $staff->phone,
                'admin_role' => $staff->admin_role,
                'admin_active' => (bool) $staff->admin_active,
            ],
        ], 201);
    }

    public function updateRole(Request $request, User $staff)
    {
        $this->authorizeStaffManagement($request);

        $validated = $request->validate([
            'admin_role' => ['required', 'string', Rule::in(User::ADMIN_ROLES)],
        ]);

        abort_if($staff->role !== 'admin', 404, 'Admin staff account not found.');

        DB::transaction(function () use ($request, $staff, $validated) {
            $lockedUsers = User::query()
                ->where('role', 'admin')
                ->orderBy('id')
                ->lockForUpdate()
                ->get()
                ->keyBy('id');
            $actor = $lockedUsers->get($request->user()->id);
            $lockedStaff = $lockedUsers->get($staff->id);

            abort_if(! $actor?->hasAdminPermission('staff.manage'), 403, 'Only Super Admins can manage administrator access.');
            abort_if(! $lockedStaff || $lockedStaff->role !== 'admin', 404, 'Admin staff account not found.');

            if ($lockedStaff->id === $actor->id
                && $lockedStaff->admin_role !== $validated['admin_role']) {
                throw ValidationException::withMessages([
                    'admin_role' => ['You cannot change your own administrator role.'],
                ]);
            }

            if ($lockedStaff->admin_active
                && $lockedStaff->admin_role === 'super_admin'
                && $validated['admin_role'] !== 'super_admin') {
                $superAdminCount = User::query()
                    ->where('role', 'admin')
                    ->where('admin_role', 'super_admin')
                    ->where('admin_active', true)
                    ->count();

                if ($superAdminCount <= 1) {
                    throw ValidationException::withMessages([
                        'admin_role' => ['At least one Super Admin must remain.'],
                    ]);
                }
            }

            $oldRole = $lockedStaff->admin_role ?? 'support';
            if ($oldRole === $validated['admin_role']) {
                return;
            }

            $lockedStaff->update(['admin_role' => $validated['admin_role']]);

            AdminAuditLog::record(
                $actor,
                'admin.role_changed',
                'user',
                $lockedStaff->id,
                'Changed admin #'.$lockedStaff->id.' from '.$oldRole.' to '.$validated['admin_role'].'.',
            );
        });

        return response()->json(['message' => 'Administrator role updated.']);
    }

    public function updateActive(Request $request, User $staff)
    {
        $this->authorizeStaffManagement($request);

        $validated = $request->validate([
            'active' => ['required', 'boolean'],
        ]);
        abort_if($staff->role !== 'admin', 404, 'Admin staff account not found.');

        DB::transaction(function () use ($request, $staff, $validated) {
            $lockedUsers = User::query()
                ->where('role', 'admin')
                ->orderBy('id')
                ->lockForUpdate()
                ->get()
                ->keyBy('id');
            $actor = $lockedUsers->get($request->user()->id);
            $lockedStaff = $lockedUsers->get($staff->id);

            abort_if(! $actor?->hasAdminPermission('staff.manage'), 403, 'Only Super Admins can manage administrator access.');
            abort_if(! $lockedStaff, 404, 'Admin staff account not found.');

            if ($actor->id === $lockedStaff->id) {
                throw ValidationException::withMessages([
                    'active' => ['You cannot deactivate your own administrator account.'],
                ]);
            }

            $shouldBeActive = (bool) $validated['active'];
            if ((bool) $lockedStaff->admin_active === $shouldBeActive) {
                return;
            }

            if (! $shouldBeActive && $lockedStaff->admin_role === 'super_admin') {
                $activeSuperAdminCount = $lockedUsers
                    ->filter(fn (User $member) => $member->admin_role === 'super_admin' && $member->admin_active)
                    ->count();

                if ($activeSuperAdminCount <= 1) {
                    throw ValidationException::withMessages([
                        'active' => ['At least one active Super Admin must remain.'],
                    ]);
                }
            }

            $lockedStaff->update(['admin_active' => $shouldBeActive]);
            if (! $shouldBeActive) {
                $lockedStaff->tokens()->delete();
            }

            AdminAuditLog::record(
                $actor,
                $shouldBeActive ? 'admin.activated' : 'admin.deactivated',
                'user',
                $lockedStaff->id,
                ($shouldBeActive ? 'Reactivated' : 'Deactivated').' admin #'.$lockedStaff->id.'.',
            );
        });

        return response()->json([
            'message' => $validated['active'] ? 'Administrator account reactivated.' : 'Administrator account deactivated and active tokens revoked.',
        ]);
    }

    private function authorizeStaffManagement(Request $request): void
    {
        if (! $request->user()->hasAdminPermission('staff.manage')) {
            abort(403, 'Only Super Admins can manage administrator access.');
        }
    }
}
