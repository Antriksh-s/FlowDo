import React, { useEffect, useState } from 'react';
import { Task } from '../types';

interface TaskFileStackProps {
  tasks: Task[];
}

export default function TaskFileStack({ tasks }: TaskFileStackProps) {
  // We represent empty decorative file sheets stacked on top of each other cascading vertically
  // No text or details inside, just abstract subtle card frames floating with an elegant CSS animation.
  return (
    <div 
      id="background-biorhythm-file-stack" 
      className="fixed inset-0 pointer-events-none select-none z-0 overflow-hidden opacity-[0.022] transition-opacity duration-1000"
    >
      {/* Floating Cascading Elements */}
      <div className="absolute inset-0 flex justify-between px-[4%] lg:px-[8%]">
        
        {/* Left Column Stack Cascade */}
        <div className="relative w-48 h-full flex flex-col justify-around py-16">
          <div className="relative w-40 h-52 animate-float-slow">
            <div className="absolute inset-0 bg-slate-900 border border-slate-700 rounded-2xl transform rotate-[-6deg] shadow-lg"></div>
            <div className="absolute inset-0 bg-slate-800 border border-slate-600 rounded-2xl transform rotate-[2deg] translate-x-3 translate-y-2 shadow-md"></div>
            <div className="absolute inset-0 bg-blue-900 border border-blue-700 rounded-2xl transform rotate-[-2deg] translate-x-5 translate-y-5 shadow-sm"></div>
          </div>

          <div className="relative w-36 h-48 animate-float-delayed transform translate-x-6">
            <div className="absolute inset-0 bg-slate-900 border border-slate-700 rounded-xl transform rotate-[4deg] shadow-lg"></div>
            <div className="absolute inset-0 bg-slate-800 border border-slate-600 rounded-xl transform rotate-[-3deg] translate-x-2 translate-y-1 shadow-md"></div>
            <div className="absolute inset-0 bg-emerald-900 border border-emerald-700 rounded-xl transform rotate-[1deg] translate-x-4 translate-y-3 shadow-sm"></div>
          </div>
        </div>

        {/* Center Subdued Drift Stack */}
        <div className="relative w-48 h-full hidden md:flex flex-col justify-center py-20">
          <div className="relative w-44 h-56 animate-float-super-slow">
            <div className="absolute inset-0 bg-slate-900 border border-slate-700 rounded-2xl transform rotate-[12deg] shadow-xl"></div>
            <div className="absolute inset-0 bg-slate-800 border border-slate-600 rounded-2xl transform rotate-[-5deg] translate-x-4 translate-y-2 shadow-lg"></div>
            <div className="absolute inset-0 bg-slate-900 border border-slate-700 rounded-2xl transform rotate-[2deg] translate-x-8 translate-y-6 shadow-md"></div>
          </div>
        </div>

        {/* Right Column Stack Cascade */}
        <div className="relative w-48 h-full flex flex-col justify-around py-12">
          <div className="relative w-40 h-52 animate-float-delayed">
            <div className="absolute inset-0 bg-slate-900 border border-slate-700 rounded-2xl transform rotate-[5deg] shadow-lg"></div>
            <div className="absolute inset-0 bg-slate-800 border border-slate-600 rounded-2xl transform rotate-[-4deg] translate-x-3 translate-y-2 shadow-md"></div>
            <div className="absolute inset-0 bg-blue-900 border border-blue-700 rounded-2xl transform rotate-[3deg] translate-x-6 translate-y-4 shadow-sm"></div>
          </div>

          <div className="relative w-36 h-48 animate-float-slow transform -translate-x-6">
            <div className="absolute inset-0 bg-slate-900 border border-slate-700 rounded-xl transform rotate-[-8deg] shadow-lg"></div>
            <div className="absolute inset-0 bg-slate-800 border border-slate-600 rounded-xl transform rotate-[2deg] translate-x-2 translate-y-1 shadow-md"></div>
            <div className="absolute inset-0 bg-purple-900 border border-purple-700 rounded-xl transform rotate-[-2deg] translate-x-4 translate-y-3 shadow-sm"></div>
          </div>
        </div>

      </div>

      {/* Embedded Floating Animation Styles */}
      <style>{`
        @keyframes float-slow {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-15px) rotate(2deg); }
        }
        @keyframes float-delayed {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(12px) rotate(-2deg); }
        }
        @keyframes float-super-slow {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-20px) rotate(-1deg); }
        }
        .animate-float-slow {
          animation: float-slow 12s ease-in-out infinite;
        }
        .animate-float-delayed {
          animation: float-delayed 15s ease-in-out infinite;
          animation-delay: 3s;
        }
        .animate-float-super-slow {
          animation: float-super-slow 20s ease-in-out infinite;
          animation-delay: 1.5s;
        }
      `}</style>
    </div>
  );
}
