import { useState, useRef } from 'react';

interface SwipeToAcceptProps {
  onAccept: () => void;
  onDecline: () => void;
  estimatedFare: string;
}

const SwipeToAccept = ({ onAccept, onDecline, estimatedFare }: SwipeToAcceptProps) => {
  const [sliderPosition, setSliderPosition] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isAccepted, setIsAccepted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLDivElement>(null);

  const getMaxSwipe = () => containerRef.current && buttonRef.current
    ? containerRef.current.offsetWidth - buttonRef.current.offsetWidth - 8
    : 250;

  const handleDragStart = () => {
    if (isAccepted) return;
    setIsDragging(true);
  };

  const handleDragMove = (clientX: number) => {
    if (!isDragging || isAccepted || !containerRef.current || !buttonRef.current) return;
    
    const containerRect = containerRef.current.getBoundingClientRect();
    const maxSwipe = getMaxSwipe();
    const newPosition = clientX - containerRect.left - (buttonRef.current.offsetWidth / 2);
    
    // Constrain the slider within the container
    if (newPosition >= 0 && newPosition <= maxSwipe) {
      setSliderPosition(newPosition);
    } else if (newPosition > maxSwipe) {
      setSliderPosition(maxSwipe);
    }
  };

  const handleDragEnd = () => {
    if (!isDragging || isAccepted) return;
    setIsDragging(false);

    // If swiped more than 80% of the way, accept the trip
    const maxSwipe = getMaxSwipe();
    if (sliderPosition > maxSwipe * 0.8) {
      setSliderPosition(maxSwipe);
      setIsAccepted(true);
      setTimeout(() => onAccept(), 300); // Small delay for the animation to finish
    } else {
      // Snap back to start
      setSliderPosition(0);
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    handleDragStart();
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => handleDragMove(e.clientX);
  const onPointerUp = () => handleDragEnd();

  return (
    <div className="w-full flex flex-col gap-4">
      <div 
        ref={containerRef}
        className="relative w-full h-16 bg-gray-100 rounded-full overflow-hidden shadow-inner flex items-center p-1"
      >
        {/* Background Text */}
        <div className="absolute w-full text-center text-gray-500 font-bold select-none pointer-events-none z-0">
          {isAccepted ? 'Accepted!' : `Swipe to Accept ₵${estimatedFare}`}
        </div>

        {/* Draggable Button */}
        <div
          ref={buttonRef}
          className={`h-14 w-20 bg-green-500 rounded-full shadow-md flex items-center justify-center cursor-pointer z-10 transition-transform ${isDragging ? 'duration-0' : 'duration-300'}`}
          style={{ transform: `translateX(${sliderPosition}px)` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </div>
      </div>
      
      <button 
        onClick={onDecline}
        className="w-full py-3 text-red-500 font-bold bg-red-50 rounded-xl active:scale-95 transition-all"
      >
        Decline Trip
      </button>
    </div>
  );
};

export default SwipeToAccept;