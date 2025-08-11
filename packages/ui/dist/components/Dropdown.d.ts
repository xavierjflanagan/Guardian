import { ReactNode } from 'react';
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
export declare function Dropdown({ trigger, children, align, position, className, disabled, closeOnItemClick, onOpenChange }: DropdownProps): import("react/jsx-runtime").JSX.Element;
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
export declare function DropdownItem({ children, onClick, disabled, className, active, selected, variant, leftIcon, rightIcon }: DropdownItemProps): import("react/jsx-runtime").JSX.Element;
export interface DropdownDividerProps {
    className?: string;
}
export declare function DropdownDivider({ className }: DropdownDividerProps): import("react/jsx-runtime").JSX.Element;
export interface DropdownHeaderProps {
    children: ReactNode;
    className?: string;
}
export declare function DropdownHeader({ children, className }: DropdownHeaderProps): import("react/jsx-runtime").JSX.Element;
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
export declare function SelectDropdown({ value, onChange, placeholder, options, disabled, className, error }: SelectDropdownProps): import("react/jsx-runtime").JSX.Element;
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
export declare function MenuDropdown({ items, trigger, className, disabled }: MenuDropdownProps): import("react/jsx-runtime").JSX.Element;
export type { DropdownProps, DropdownItemProps, DropdownDividerProps, DropdownHeaderProps, SelectDropdownProps, MenuDropdownProps };
