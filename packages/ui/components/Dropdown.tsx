'use client';

import { useState, useRef, useEffect, ReactNode, KeyboardEvent } from 'react';
import { Check, ChevronDown } from 'lucide-react';

// Enhanced dropdown component with Guardian design system
export interface DropdownProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: 'left' | 'right' | 'center';
  position?: 'bottom' | 'top';
  className?: string;
  disabled?: boolean;
  closeOnItemClick?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

export function Dropdown({ 
  trigger, 
  children, 
  align = 'right', 
  position = 'bottom',
  className = '',
  disabled = false,
  closeOnItemClick = true,
  onOpenChange
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  const toggleOpen = (newState?: boolean) => {
    if (disabled) return;
    
    const nextState = newState !== undefined ? newState : !isOpen;
    setIsOpen(nextState);
    onOpenChange?.(nextState);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        toggleOpen(false);
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
        toggleOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape as any);
      return () => document.removeEventListener('keydown', handleEscape as any);
    }
  }, [isOpen]);

  // Alignment classes
  const alignmentClasses = {
    'left': 'left-0',
    'right': 'right-0',
    'center': 'left-1/2 transform -translate-x-1/2'
  };

  const positionClasses = position === 'top' 
    ? 'bottom-full mb-2' 
    : 'top-full mt-2';

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <div 
        ref={triggerRef}
        onClick={() => toggleOpen()}
        className={`cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        aria-haspopup="true"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleOpen();
          }
        }}
      >
        {trigger}
      </div>

      {isOpen && !disabled && (
        <>
          {/* Backdrop for mobile */}
          <div className="fixed inset-0 z-40 md:hidden" />
          
          {/* Dropdown menu */}
          <div 
            className={`
              absolute ${positionClasses} ${alignmentClasses[align]} min-w-56
              bg-white rounded-lg shadow-floating border border-neutral-200 z-50
              transform transition-all duration-200 ease-out
              ${isOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}
              animate-fade-in
            `}
          >
            <div className="py-1" onClick={closeOnItemClick ? () => toggleOpen(false) : undefined}>
              {children}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Dropdown item component
export interface DropdownItemProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  active?: boolean;
  selected?: boolean;
  variant?: 'default' | 'danger' | 'success';
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export function DropdownItem({ 
  children, 
  onClick, 
  disabled = false, 
  className = '',
  active = false,
  selected = false,
  variant = 'default',
  leftIcon,
  rightIcon
}: DropdownItemProps) {
  const baseClasses = 'w-full text-left px-4 py-3 text-sm transition-colors flex items-center space-x-3';
  
  const variantClasses = {
    'default': active 
      ? 'bg-primary-50 text-primary-700' 
      : 'text-neutral-700 hover:bg-neutral-50',
    'danger': active
      ? 'bg-error-50 text-error-700'
      : 'text-error-600 hover:bg-error-50',
    'success': active
      ? 'bg-success-50 text-success-700'
      : 'text-success-600 hover:bg-success-50'
  };
  
  const stateClasses = disabled 
    ? 'opacity-50 cursor-not-allowed' 
    : 'cursor-pointer';

  return (
    <button
      className={`
        ${baseClasses}
        ${variantClasses[variant]}
        ${stateClasses}
        first:rounded-t-lg last:rounded-b-lg
        ${className}
      `}
      onClick={onClick}
      disabled={disabled}
    >
      {leftIcon && (
        <span className="flex-shrink-0 w-4 h-4">
          {leftIcon}
        </span>
      )}
      
      <span className="flex-1 text-left">
        {children}
      </span>
      
      {selected && !rightIcon && (
        <Check className="w-4 h-4 flex-shrink-0" />
      )}
      
      {rightIcon && (
        <span className="flex-shrink-0 w-4 h-4">
          {rightIcon}
        </span>
      )}
    </button>
  );
}

// Dropdown divider
export interface DropdownDividerProps {
  className?: string;
}

export function DropdownDivider({ className = '' }: DropdownDividerProps) {
  return <div className={`border-t border-neutral-200 my-1 ${className}`} />;
}

// Dropdown header for sections
export interface DropdownHeaderProps {
  children: ReactNode;
  className?: string;
}

export function DropdownHeader({ children, className = '' }: DropdownHeaderProps) {
  return (
    <div className={`px-4 py-2 text-xs font-semibold text-neutral-500 uppercase tracking-wide ${className}`}>
      {children}
    </div>
  );
}

// Select dropdown variant for form controls
export interface SelectDropdownProps {
  value?: string | number;
  onChange?: (value: string | number) => void;
  placeholder?: string;
  options: Array<{
    value: string | number;
    label: string;
    disabled?: boolean;
  }>;
  disabled?: boolean;
  className?: string;
  error?: boolean;
}

export function SelectDropdown({
  value,
  onChange,
  placeholder = 'Select option...',
  options,
  disabled = false,
  className = '',
  error = false
}: SelectDropdownProps) {
  const selectedOption = options.find(option => option.value === value);
  
  const triggerClasses = `
    form-input flex items-center justify-between cursor-pointer
    ${error ? 'border-error-300 focus:border-error-500 focus:ring-error-500' : ''}
    ${disabled ? 'bg-neutral-100 cursor-not-allowed' : 'hover:border-neutral-400'}
    ${className}
  `;

  return (
    <Dropdown
      disabled={disabled}
      trigger={
        <div className={triggerClasses}>
          <span className={selectedOption ? 'text-neutral-900' : 'text-neutral-400'}>
            {selectedOption?.label || placeholder}
          </span>
          <ChevronDown className="w-4 h-4 text-neutral-400 flex-shrink-0" />
        </div>
      }
    >
      {options.map((option) => (
        <DropdownItem
          key={option.value}
          onClick={() => onChange?.(option.value)}
          disabled={option.disabled}
          selected={option.value === value}
        >
          {option.label}
        </DropdownItem>
      ))}
    </Dropdown>
  );
}

// Menu dropdown for actions
export interface MenuDropdownProps {
  items: Array<{
    label: string;
    onClick: () => void;
    icon?: ReactNode;
    variant?: DropdownItemProps['variant'];
    disabled?: boolean;
    dividerAfter?: boolean;
  }>;
  trigger: ReactNode;
  className?: string;
  disabled?: boolean;
}

export function MenuDropdown({ items, trigger, className = '', disabled = false }: MenuDropdownProps) {
  return (
    <Dropdown trigger={trigger} className={className} disabled={disabled}>
      {items.map((item, index) => (
        <div key={index}>
          <DropdownItem
            onClick={item.onClick}
            disabled={item.disabled}
            variant={item.variant}
            leftIcon={item.icon}
          >
            {item.label}
          </DropdownItem>
          {item.dividerAfter && <DropdownDivider />}
        </div>
      ))}
    </Dropdown>
  );
}

// Types are already exported with their interface definitions above