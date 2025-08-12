'use client';

import React from 'react';
import { LucideIcon } from 'lucide-react';

// Button component types
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  isLoading?: boolean;
  loadingText?: string;
  leftIcon?: LucideIcon;
  rightIcon?: LucideIcon;
  fullWidth?: boolean;
  children: React.ReactNode;
}

// Button variant styles using Guardian design system
const getVariantClasses = (variant: ButtonProps['variant'] = 'primary'): string => {
  const variants = {
    'primary': 'btn-primary',
    'secondary': 'btn bg-secondary-600 text-white hover:bg-secondary-700 focus:ring-secondary-500',
    'outline': 'btn-outline',
    'ghost': 'btn-ghost',
    'danger': 'btn bg-error-600 text-white hover:bg-error-700 focus:ring-error-500',
    'success': 'btn bg-success-600 text-white hover:bg-success-700 focus:ring-success-500'
  };
  
  return variants[variant];
};

// Button size configurations
const getSizeClasses = (size: ButtonProps['size'] = 'md'): string => {
  const sizes = {
    'xs': 'px-2.5 py-1.5 text-xs',
    'sm': 'px-3 py-2 text-sm',
    'md': 'px-4 py-2 text-sm',
    'lg': 'px-4 py-2 text-base',
    'xl': 'px-6 py-3 text-base'
  };
  
  return sizes[size];
};

// Loading spinner component
const LoadingSpinner: React.FC<{ size: ButtonProps['size'] }> = ({ size = 'md' }) => {
  const spinnerSizes = {
    'xs': 'w-3 h-3',
    'sm': 'w-4 h-4',
    'md': 'w-4 h-4',
    'lg': 'w-5 h-5',
    'xl': 'w-5 h-5'
  };
  
  return (
    <div className={`animate-spin rounded-full border-2 border-current border-t-transparent ${spinnerSizes[size]}`} />
  );
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  loadingText,
  leftIcon: LeftIcon,
  rightIcon: RightIcon,
  fullWidth = false,
  disabled,
  className = '',
  children,
  ...props
}, ref) => {
  const variantClasses = getVariantClasses(variant);
  const sizeClasses = getSizeClasses(size);
  
  const buttonClasses = `
    ${variantClasses}
    ${sizeClasses}
    ${fullWidth ? 'w-full' : ''}
    ${isLoading || disabled ? 'cursor-not-allowed opacity-50' : ''}
    ${className}
  `.trim();
  
  const iconSize = size === 'xs' ? 12 : size === 'sm' ? 14 : size === 'md' ? 16 : size === 'lg' ? 18 : 20;
  
  return (
    <button
      ref={ref}
      className={buttonClasses}
      disabled={isLoading || disabled}
      {...props}
    >
      <span className="flex items-center justify-center space-x-2">
        {/* Loading spinner or left icon */}
        {isLoading ? (
          <LoadingSpinner size={size} />
        ) : LeftIcon ? (
          <LeftIcon size={iconSize} className="flex-shrink-0" />
        ) : null}
        
        {/* Button text */}
        <span>
          {isLoading && loadingText ? loadingText : children}
        </span>
        
        {/* Right icon (not shown during loading) */}
        {!isLoading && RightIcon && (
          <RightIcon size={iconSize} className="flex-shrink-0" />
        )}
      </span>
    </button>
  );
});

Button.displayName = 'Button';

// Icon-only button variant
export interface IconButtonProps extends Omit<ButtonProps, 'leftIcon' | 'rightIcon' | 'children'> {
  icon: LucideIcon;
  'aria-label': string;
  tooltip?: string;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(({
  icon: Icon,
  size = 'md',
  className = '',
  ...props
}, ref) => {
  const sizeClasses = {
    'xs': 'p-1',
    'sm': 'p-1.5',
    'md': 'p-2',
    'lg': 'p-2.5',
    'xl': 'p-3'
  };
  
  const iconSizes = {
    'xs': 12,
    'sm': 14,
    'md': 16,
    'lg': 18,
    'xl': 20
  };
  
  return (
    <Button
      ref={ref}
      size={size}
      className={`${sizeClasses[size]} ${className}`}
      {...props}
    >
      <Icon size={iconSizes[size]} />
    </Button>
  );
});

IconButton.displayName = 'IconButton';

// Button group component for related actions
export interface ButtonGroupProps {
  children: React.ReactNode;
  orientation?: 'horizontal' | 'vertical';
  size?: ButtonProps['size'];
  variant?: ButtonProps['variant'];
  className?: string;
}

export function ButtonGroup({ 
  children, 
  orientation = 'horizontal',
  size,
  variant,
  className = '' 
}: ButtonGroupProps) {
  const groupClasses = `
    inline-flex
    ${orientation === 'horizontal' ? 'flex-row -space-x-px' : 'flex-col -space-y-px'}
    ${className}
  `.trim();
  
  // Clone children to apply consistent props and styling
  const enhancedChildren = React.Children.map(children, (child, index) => {
    if (!React.isValidElement(child)) return child;
    
    const isFirst = index === 0;
    const isLast = index === React.Children.count(children) - 1;
    
    const roundedClasses = orientation === 'horizontal' 
      ? `${isFirst ? 'rounded-l-md' : ''} ${isLast ? 'rounded-r-md' : ''} ${!isFirst && !isLast ? 'rounded-none' : ''}`
      : `${isFirst ? 'rounded-t-md' : ''} ${isLast ? 'rounded-b-md' : ''} ${!isFirst && !isLast ? 'rounded-none' : ''}`;
    
    const childElement = child as React.ReactElement<ButtonProps>;
    const childProps = childElement.props;
    return React.cloneElement(childElement, {
      size: childProps.size || size,
      variant: childProps.variant || variant,
      className: `${childProps.className || ''} ${roundedClasses} relative hover:z-10 focus:z-10`.trim()
    } as Partial<ButtonProps>);
  });
  
  return (
    <div className={groupClasses} role="group">
      {enhancedChildren}
    </div>
  );
}

// Floating Action Button for primary actions
export interface FABProps extends Omit<ButtonProps, 'variant' | 'size'> {
  icon: LucideIcon;
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  size?: 'md' | 'lg';
}

export function FloatingActionButton({ 
  icon: Icon, 
  position = 'bottom-right',
  size = 'lg',
  className = '',
  ...props 
}: FABProps) {
  const positionClasses = {
    'bottom-right': 'fixed bottom-6 right-6',
    'bottom-left': 'fixed bottom-6 left-6',
    'top-right': 'fixed top-6 right-6',
    'top-left': 'fixed top-6 left-6'
  };
  
  const sizeClasses = {
    'md': 'w-12 h-12',
    'lg': 'w-14 h-14'
  };
  
  const iconSizes = {
    'md': 20,
    'lg': 24
  };
  
  return (
    <button
      className={`
        ${positionClasses[position]}
        ${sizeClasses[size]}
        bg-primary-600 text-white rounded-full shadow-floating
        hover:bg-primary-700 focus:bg-primary-700
        transition-colors duration-200
        flex items-center justify-center
        z-50
        ${className}
      `.trim()}
      {...props}
    >
      <Icon size={iconSizes[size]} />
    </button>
  );
}

// Types are already exported with their interface definitions above