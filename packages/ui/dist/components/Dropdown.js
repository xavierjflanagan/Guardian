'use client';
import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown } from 'lucide-react';
export function Dropdown({ trigger, children, align = 'right', position = 'bottom', className = '', disabled = false, closeOnItemClick = true, onOpenChange }) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);
    const triggerRef = useRef(null);
    const toggleOpen = (newState) => {
        if (disabled)
            return;
        const nextState = newState !== undefined ? newState : !isOpen;
        setIsOpen(nextState);
        onOpenChange?.(nextState);
    };
    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
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
        function handleEscape(event) {
            if (event.key === 'Escape') {
                toggleOpen(false);
            }
        }
        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            return () => document.removeEventListener('keydown', handleEscape);
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
    return (_jsxs("div", { className: `relative ${className}`, ref: dropdownRef, children: [_jsx("div", { ref: triggerRef, onClick: () => toggleOpen(), className: `cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`, role: "button", tabIndex: 0, "aria-expanded": isOpen, "aria-haspopup": "true", onKeyDown: (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleOpen();
                    }
                }, children: trigger }), isOpen && !disabled && (_jsxs(_Fragment, { children: [_jsx("div", { className: "fixed inset-0 z-40 md:hidden" }), _jsx("div", { className: `
              absolute ${positionClasses} ${alignmentClasses[align]} min-w-56
              bg-white rounded-lg shadow-floating border border-neutral-200 z-50
              transform transition-all duration-200 ease-out
              ${isOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}
              animate-fade-in
            `, children: _jsx("div", { className: "py-1", onClick: closeOnItemClick ? () => toggleOpen(false) : undefined, children: children }) })] }))] }));
}
export function DropdownItem({ children, onClick, disabled = false, className = '', active = false, selected = false, variant = 'default', leftIcon, rightIcon }) {
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
    return (_jsxs("button", { className: `
        ${baseClasses}
        ${variantClasses[variant]}
        ${stateClasses}
        first:rounded-t-lg last:rounded-b-lg
        ${className}
      `, onClick: onClick, disabled: disabled, children: [leftIcon && (_jsx("span", { className: "flex-shrink-0 w-4 h-4", children: leftIcon })), _jsx("span", { className: "flex-1 text-left", children: children }), selected && !rightIcon && (_jsx(Check, { className: "w-4 h-4 flex-shrink-0" })), rightIcon && (_jsx("span", { className: "flex-shrink-0 w-4 h-4", children: rightIcon }))] }));
}
export function DropdownDivider({ className = '' }) {
    return _jsx("div", { className: `border-t border-neutral-200 my-1 ${className}` });
}
export function DropdownHeader({ children, className = '' }) {
    return (_jsx("div", { className: `px-4 py-2 text-xs font-semibold text-neutral-500 uppercase tracking-wide ${className}`, children: children }));
}
export function SelectDropdown({ value, onChange, placeholder = 'Select option...', options, disabled = false, className = '', error = false }) {
    const selectedOption = options.find(option => option.value === value);
    const triggerClasses = `
    form-input flex items-center justify-between cursor-pointer
    ${error ? 'border-error-300 focus:border-error-500 focus:ring-error-500' : ''}
    ${disabled ? 'bg-neutral-100 cursor-not-allowed' : 'hover:border-neutral-400'}
    ${className}
  `;
    return (_jsx(Dropdown, { disabled: disabled, trigger: _jsxs("div", { className: triggerClasses, children: [_jsx("span", { className: selectedOption ? 'text-neutral-900' : 'text-neutral-400', children: selectedOption?.label || placeholder }), _jsx(ChevronDown, { className: "w-4 h-4 text-neutral-400 flex-shrink-0" })] }), children: options.map((option) => (_jsx(DropdownItem, { onClick: () => onChange?.(option.value), disabled: option.disabled, selected: option.value === value, children: option.label }, option.value))) }));
}
export function MenuDropdown({ items, trigger, className = '', disabled = false }) {
    return (_jsx(Dropdown, { trigger: trigger, className: className, disabled: disabled, children: items.map((item, index) => (_jsxs("div", { children: [_jsx(DropdownItem, { onClick: item.onClick, disabled: item.disabled, variant: item.variant, leftIcon: item.icon, children: item.label }), item.dividerAfter && _jsx(DropdownDivider, {})] }, index))) }));
}
