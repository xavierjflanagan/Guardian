'use client';

import { useState, useRef, useEffect, ReactNode } from 'react';

interface DropdownProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: 'left' | 'right';
  className?: string;
}

export function Dropdown({ trigger, children, align = 'right', className = '' }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Close dropdown on escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen]);

  const alignmentClasses = align === 'left' ? 'left-0' : 'right-0';

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="cursor-pointer"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsOpen(!isOpen);
          }
        }}
      >
        {trigger}
      </div>

      {isOpen && (
        <>
          {/* Backdrop for mobile */}
          <div className="fixed inset-0 bg-black bg-opacity-25 z-40 md:hidden" />
          
          {/* Dropdown menu */}
          <div 
            className={`
              absolute top-full mt-2 min-w-56 bg-white rounded-lg shadow-lg border border-gray-200 z-50
              ${alignmentClasses}
              transform transition-all duration-200 ease-out
              ${isOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}
            `}
          >
            {children}
          </div>
        </>
      )}
    </div>
  );
}

interface DropdownItemProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  active?: boolean;
}

export function DropdownItem({ 
  children, 
  onClick, 
  disabled = false, 
  className = '',
  active = false
}: DropdownItemProps) {
  return (
    <button
      className={`
        w-full text-left px-4 py-3 text-sm transition-colors
        ${active 
          ? 'bg-blue-50 text-blue-700' 
          : 'text-gray-700 hover:bg-gray-50'
        }
        ${disabled 
          ? 'opacity-50 cursor-not-allowed' 
          : 'hover:bg-gray-50'
        }
        first:rounded-t-lg last:rounded-b-lg
        ${className}
      `}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

interface DropdownDividerProps {
  className?: string;
}

export function DropdownDivider({ className = '' }: DropdownDividerProps) {
  return <div className={`border-t border-gray-200 my-1 ${className}`} />;
}