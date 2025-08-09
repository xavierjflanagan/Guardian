import React from 'react';
import { LucideIcon } from 'lucide-react';
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
export declare const Button: React.ForwardRefExoticComponent<ButtonProps & React.RefAttributes<HTMLButtonElement>>;
export interface IconButtonProps extends Omit<ButtonProps, 'leftIcon' | 'rightIcon' | 'children'> {
    icon: LucideIcon;
    'aria-label': string;
    tooltip?: string;
}
export declare const IconButton: React.ForwardRefExoticComponent<IconButtonProps & React.RefAttributes<HTMLButtonElement>>;
export interface ButtonGroupProps {
    children: React.ReactNode;
    orientation?: 'horizontal' | 'vertical';
    size?: ButtonProps['size'];
    variant?: ButtonProps['variant'];
    className?: string;
}
export declare function ButtonGroup({ children, orientation, size, variant, className }: ButtonGroupProps): import("react/jsx-runtime").JSX.Element;
export interface FABProps extends Omit<ButtonProps, 'variant' | 'size'> {
    icon: LucideIcon;
    position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
    size?: 'md' | 'lg';
}
export declare function FloatingActionButton({ icon: Icon, position, size, className, ...props }: FABProps): import("react/jsx-runtime").JSX.Element;
export type { ButtonProps, IconButtonProps, ButtonGroupProps, FABProps };
