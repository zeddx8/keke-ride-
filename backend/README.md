<p align="center"><a href="https://laravel.com" target="_blank"><img src="https://raw.githubusercontent.com/laravel/art/master/logo-lockup/5%20SVG/2%20CMYK/1%20Full%20Color/laravel-logolockup-cmyk-red.svg" width="400" alt="Laravel Logo"></a></p>

<p align="center">
<a href="https://github.com/laravel/framework/actions"><img src="https://github.com/laravel/framework/workflows/tests/badge.svg" alt="Build Status"></a>
<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/dt/laravel/framework" alt="Total Downloads"></a>
<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/v/laravel/framework" alt="Latest Stable Version"></a>
<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/l/laravel/framework" alt="License"></a>
</p>

## About Laravel

Laravel is a web application framework with expressive, elegant syntax. We believe development must be an enjoyable and creative experience to be truly fulfilling. Laravel takes the pain out of development by easing common tasks used in many web projects, such as:

- [Simple, fast routing engine](https://laravel.com/docs/routing).
- [Powerful dependency injection container](https://laravel.com/docs/container).
- Multiple back-ends for [session](https://laravel.com/docs/session) and [cache](https://laravel.com/docs/cache) storage.
- Expressive, intuitive [database ORM](https://laravel.com/docs/eloquent).
- Database agnostic [schema migrations](https://laravel.com/docs/migrations).
- [Robust background job processing](https://laravel.com/docs/queues).
- [Real-time event broadcasting](https://laravel.com/docs/broadcasting).

Laravel is accessible, powerful, and provides tools required for large, robust applications.

## Learning Laravel

Laravel has the most extensive and thorough [documentation](https://laravel.com/docs) and video tutorial library of all modern web application frameworks, making it a breeze to get started with the framework. You can also check out [Laravel Learn](https://laravel.com/learn), where you will be guided through building a modern Laravel application.

If you don't feel like reading, [Laracasts](https://laracasts.com) can help. Laracasts contains thousands of video tutorials on a range of topics including Laravel, modern PHP, unit testing, and JavaScript. Boost your skills by digging into our comprehensive video library.

## Laravel Sponsors

We would like to extend our thanks to the following sponsors for funding Laravel development. If you are interested in becoming a sponsor, please visit the [Laravel Partners program](https://partners.laravel.com).

### Premium Partners

- **[Vehikl](https://vehikl.com)**
- **[Tighten Co.](https://tighten.co)**
- **[Kirschbaum Development Group](https://kirschbaumdevelopment.com)**
- **[64 Robots](https://64robots.com)**
- **[Curotec](https://www.curotec.com/services/technologies/laravel)**
- **[DevSquad](https://devsquad.com/hire-laravel-developers)**
- **[Redberry](https://redberry.international/laravel-development)**
- **[Active Logic](https://activelogic.com)**

## Contributing

Thank you for considering contributing to the Laravel framework! The contribution guide can be found in the [Laravel documentation](https://laravel.com/docs/contributions).

## Code of Conduct

In order to ensure that the Laravel community is welcoming to all, please review and abide by the [Code of Conduct](https://laravel.com/docs/contributions#code-of-conduct).

## Security Vulnerabilities

If you discover a security vulnerability within Laravel, please send an e-mail to Taylor Otwell via [taylor@laravel.com](mailto:taylor@laravel.com). All security vulnerabilities will be promptly addressed.

## License

The Laravel framework is open-sourced software licensed under the [MIT license](https://opensource.org/licenses/MIT).

## Map provider operationswhat 

Routing and place search use the `ROUTING_*` and `PLACE_SEARCH_*` settings in `.env`. The default public OSRM and Nominatim demo endpoints are development defaults and are rejected by the services when `APP_ENV=production`; configure production provider URLs before deployment. Use a valid, monitored contact in `PLACE_SEARCH_USER_AGENT` and follow the selected provider's usage, privacy, and attribution requirements.

Provider calls resolve over IPv4 for environments where IPv6 DNS resolution or routing is unavailable, and have configurable connection and overall timeouts. Route results and place searches are cached using the configured TTLs; uncached place searches are shared-rate-limited to at most one provider request per configured interval. Use a shared production cache store so throttling applies across app instances.

Run `php artisan providers:check` to make live, uncached test requests to both providers. It exits non-zero if either provider is unavailable or a demo endpoint is configured in production, so deployment checks or an external monitor can alert on failures. The health command consumes provider quota and should be run at an appropriate monitoring interval.

## Trip ratings

Passengers can submit one 1–5 star rating and optional comment for each completed trip from Trip history. The API validates trip ownership and completion, and prevents duplicate ratings. Riders can view their average and rating count from `GET /api/rider/ratings`; passenger history includes submitted rating details.

Passengers can save up to 10 named destinations (for example Home or Work) to their account. Pickup instructions can be included with a ride request and are shown to the assigned rider. Before requesting, passengers review the estimated fare, cash payment method, route distance, pickup details, and cancellation rule: cancellation is available while searching, but not after a rider accepts. Trip sharing uses the device share sheet/SMS/clipboard to send a snapshot of trip status, locations, pickup instructions, fare estimate, payment method, and latest available locations; it is not continuous live tracking.

## Admin dashboard

Super Admins can invite staff by phone from Staff access; new invitations default to Support and use the existing Forgot password flow to verify the phone and set an initial password. Super Admins can also deactivate or reactivate staff. Deactivation blocks login, denies authenticated API access, and revokes personal access tokens; reactivation does not restore old tokens. Self-deactivation and deactivating/demoting the last active Super Admin are blocked. Invitations and activation changes are recorded in the admin audit log.

Super Admins can suspend or restore passenger and rider accounts from Accounts. Suspension requires a reason, blocks login and authenticated API access, revokes existing personal access tokens, and forces riders offline. Restoring clears the suspension reason but does not recreate revoked tokens. Suspension and restoration are audited without copying the reason into the audit summary.

Operations and Super Admins can view operational reports over a selected date range (up to 366 days) and export the same aggregate metrics as CSV. Reports include trip status and completion rate, estimated completed fares, rider trip activity, incident counts by status/category, and average incident resolution time. Rider activity is identified by account ID only; exports do not include rider/passenger names or phone numbers. Fare amounts are estimates, not reconciled payments.

Open incidents can be assigned or reassigned to active Operations or Support staff. The incident queue distinguishes unassigned cases and cases that have not received a first response within the four-hour response target. The first response is recorded when staff add their first internal note or resolve the case. Assignment changes and unassignments are audited. Operational reports include unassigned/overdue counts and average first-response time; assignment target is four hours, not a guaranteed notification or SLA alert.

Passengers and riders register with a name, phone number, and password, then verify their phone with a one-time code. Sign-in uses phone and password. Forgot password sends a separate one-time code; a successful reset verifies the phone, sets the new password, and revokes existing tokens. Passwords are at least eight characters.

OTP delivery is currently development-only and writes the code to the Laravel log. Authentication registration, verification, and password recovery return HTTP 503 in production until an SMS provider is configured; do not deploy public registration or recovery without that integration.

Rider registration routes to an onboarding form for the driver’s licence, Ghana Card, and vehicle plate. Rider document images are stored privately and delivered through temporary signed URLs. Riders remain offline until an admin approves their application; rejected profiles can be resubmitted.

Approved riders see online status, ride requests, active trip controls, ratings, trip history, and today/this-week completed-trip summaries. Fare totals are estimates, not recorded or reconciled payments. Active-trip route guidance is recalculated from the rider’s location every 30 seconds while the dashboard is open. Ride alerts can use in-app sound/vibration and browser notifications where supported and permitted; this is not push delivery when the app is closed.

The mobile app routes users with the `admin` role to the admin dashboard. Admin accounts must be provisioned by an authorized operator; public registration only accepts passenger and rider roles. Sign in with the phone number of a provisioned admin account. Admin-provisioned accounts should use Forgot password to verify their phone and set an initial password. The `admin_role` grants one of three permission sets: `super_admin` has full access and can manage staff roles; `operations` can monitor trips, review riders, manage incidents, and view the audit log; `support` can view incidents and add internal follow-up notes. API authorization enforces these roles independently of the dashboard menu. Existing admin accounts are migrated as Super Admins, while any newly provisioned admin defaults to Support until a Super Admin assigns a different role. The `/api/admin/staff` endpoints let Super Admins list admins and update a staff member's role; the acting account cannot change its own role, and at least one Super Admin must remain. Role changes are recorded in the audit log. Super Admins can suspend or restore passenger/rider accounts; suspension requires an internal reason, blocks login and authenticated API access, revokes existing tokens, and takes riders offline. Restore clears the reason but does not recreate revoked tokens. The admin workspace organizes features into URL-addressable sections and loads data only when the relevant section is opened. The overview includes open-incident and pending-rider-review alerts with direct links to their queues. The read-only, paginated `/api/admin/audit-logs` endpoint records account creation, rider approval/rejection, incident creation, internal notes, resolution, administrator role changes, and passenger/rider suspensions and restorations. Audit summaries exclude passwords, account contact details, incident note contents, and suspension reasons. The dashboard also provides an automatically refreshed active-trip operations view, an incident follow-up queue with an append-only note timeline and resolution tracking, rider review, and passenger/rider account management. Active-trip and admin incident endpoints expose trip participants, route landmarks, and incident notes only to authorized administrators. Passengers and riders can report a problem against their own trip using `POST /api/trips/{trip}/incidents`; the report is added to the admin incident queue and is inaccessible to unrelated users. Trip history includes only incidents submitted by the signed-in user, and only their status plus an explicitly shared resolution message; internal incident notes are never included. The trip history modal refreshes report status every 30 seconds while open, showing status changes as in-app updates. Admin accounts are deliberately excluded from dashboard account creation.
