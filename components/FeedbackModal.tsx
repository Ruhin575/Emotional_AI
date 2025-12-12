import React, { useState } from 'react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const FeedbackModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = () => {
    // In a real app, send to backend here
    console.log('Anonymous Feedback:', { rating, comment });
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setRating(0);
      setComment('');
      onClose();
    }, 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="feedback-title">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all scale-100">
        
        {submitted ? (
          <div className="p-10 flex flex-col items-center justify-center text-center space-y-4" role="alert">
            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-2" aria-hidden="true">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-slate-800">Thank You!</h3>
            <p className="text-slate-600">Your feedback helps us improve.</p>
          </div>
        ) : (
          <>
            <div className="bg-indigo-600 p-6 text-white flex justify-between items-start">
              <div>
                <h3 id="feedback-title" className="text-xl font-bold">App Feedback</h3>
                <p className="text-indigo-100 text-sm opacity-90">Help us make this tool better for everyone.</p>
              </div>
              <button onClick={onClose} className="text-indigo-200 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-white rounded p-1" aria-label="Close Feedback Modal">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Rating */}
              <div className="space-y-2">
                <label id="rating-label" className="text-sm font-semibold text-slate-700">How helpful is this app?</label>
                <div className="flex gap-2 justify-center" role="group" aria-labelledby="rating-label">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => setRating(star)}
                      aria-label={`Rate ${star} out of 5 stars`}
                      aria-pressed={star <= rating}
                      className={`text-3xl transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded ${star <= rating ? 'text-yellow-400' : 'text-slate-200'}`}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>

              {/* Comment */}
              <div className="space-y-2">
                <label htmlFor="feedback-comment" className="text-sm font-semibold text-slate-700">Any suggestions? (Optional)</label>
                <textarea
                  id="feedback-comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Tell us what you like or what we should fix..."
                  className="w-full p-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none h-32 resize-none text-slate-700"
                />
              </div>

              {/* Actions */}
              <button
                onClick={handleSubmit}
                disabled={rating === 0}
                className={`w-full py-3 rounded-xl font-bold text-white transition-all shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  rating > 0 
                    ? 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-lg' 
                    : 'bg-slate-300 cursor-not-allowed'
                }`}
              >
                Submit Anonymous Feedback
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
