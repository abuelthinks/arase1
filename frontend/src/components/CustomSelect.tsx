"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

export interface SelectOption {
    value: string;
    label: string;
}

/** Page-size choices shared by every paginated table. */
export const PAGE_SIZE_OPTIONS: SelectOption[] = [
    { value: '10', label: '10' },
    { value: '25', label: '25' },
    { value: '50', label: '50' },
    { value: '100', label: '100' },
];

interface CustomSelectProps {
    value: string;
    onChange: (value: string) => void;
    options: SelectOption[];
    disabled?: boolean;
    /** `sm` matches the compact filter rows; `md` matches form fields. */
    size?: 'sm' | 'md';
    placeholder?: string;
    /** Extra classes for the wrapper (width, margins). */
    className?: string;
    /** Extra classes for the trigger button (borders, tone overrides). */
    triggerClassName?: string;
    ariaLabel?: string;
}

const SIZES = {
    sm: {
        trigger: 'h-7 gap-1.5 rounded-lg px-2 text-[0.68rem] font-semibold',
        icon: 'h-3 w-3',
        option: 'gap-2 rounded-md px-2 py-1.5 text-[0.68rem] font-semibold',
        checkIcon: 'h-3 w-3',
    },
    md: {
        trigger: 'h-[42px] gap-2 rounded-xl px-3 text-sm font-medium',
        icon: 'h-4 w-4',
        option: 'gap-2 rounded-lg px-3 py-2.5 text-sm',
        checkIcon: 'h-4 w-4',
    },
} as const;

const MENU_GAP = 4;
const MENU_MAX_HEIGHT = 280;

type MenuPosition = { top: number; left: number; width: number };

export default function CustomSelect({
    value,
    onChange,
    options,
    disabled,
    size = 'md',
    placeholder = 'Select…',
    className = '',
    triggerClassName = '',
    ariaLabel,
}: CustomSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const [position, setPosition] = useState<MenuPosition | null>(null);
    const [mounted, setMounted] = useState(false);

    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const sizes = SIZES[size];
    const selectedIndex = options.findIndex(o => o.value === value);
    const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined;

    useEffect(() => setMounted(true), []);

    const close = useCallback((refocus = true) => {
        setIsOpen(false);
        setActiveIndex(-1);
        if (refocus) triggerRef.current?.focus();
    }, []);

    // The menu renders in a portal so it is never clipped by a scrolling
    // sidebar or a card with hidden overflow. That means its position has to be
    // measured from the trigger and kept in step with scroll and resize.
    const updatePosition = useCallback(() => {
        const trigger = triggerRef.current;
        if (!trigger) return;
        const rect = trigger.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const menuHeight = Math.min(MENU_MAX_HEIGHT, options.length * 40 + 8);
        const openUp = spaceBelow < menuHeight + MENU_GAP && rect.top > spaceBelow;
        setPosition({
            top: openUp ? rect.top - MENU_GAP - menuHeight : rect.bottom + MENU_GAP,
            left: rect.left,
            width: rect.width,
        });
    }, [options.length]);

    useLayoutEffect(() => {
        if (!isOpen) return;
        updatePosition();
        window.addEventListener('scroll', updatePosition, true);
        window.addEventListener('resize', updatePosition);
        return () => {
            window.removeEventListener('scroll', updatePosition, true);
            window.removeEventListener('resize', updatePosition);
        };
    }, [isOpen, updatePosition]);

    useEffect(() => {
        if (!isOpen) return;
        const handlePointerDown = (event: MouseEvent) => {
            const target = event.target as Node;
            if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
            close(false);
        };
        document.addEventListener('mousedown', handlePointerDown);
        return () => document.removeEventListener('mousedown', handlePointerDown);
    }, [isOpen, close]);

    useEffect(() => {
        if (isOpen) menuRef.current?.focus();
    }, [isOpen, position]);

    const open = () => {
        if (disabled) return;
        setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
        setIsOpen(true);
    };

    const commit = (index: number) => {
        const option = options[index];
        if (!option) return;
        onChange(option.value);
        close();
    };

    const handleTriggerKeyDown = (event: React.KeyboardEvent) => {
        if (isOpen) return;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            open();
        }
    };

    const handleMenuKeyDown = (event: React.KeyboardEvent) => {
        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                setActiveIndex(i => (i + 1) % options.length);
                break;
            case 'ArrowUp':
                event.preventDefault();
                setActiveIndex(i => (i - 1 + options.length) % options.length);
                break;
            case 'Home':
                event.preventDefault();
                setActiveIndex(0);
                break;
            case 'End':
                event.preventDefault();
                setActiveIndex(options.length - 1);
                break;
            case 'Enter':
            case ' ':
                event.preventDefault();
                commit(activeIndex);
                break;
            case 'Escape':
                event.preventDefault();
                close();
                break;
            case 'Tab':
                close(false);
                break;
        }
    };

    return (
        <div className={`relative ${className}`}>
            <button
                ref={triggerRef}
                type="button"
                disabled={disabled}
                onClick={() => (isOpen ? close() : open())}
                onKeyDown={handleTriggerKeyDown}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                aria-label={ariaLabel}
                className={`flex w-full items-center justify-between border bg-card text-fg transition-colors ${sizes.trigger} ${
                    disabled
                        ? 'cursor-not-allowed opacity-60'
                        : isOpen
                            ? 'cursor-pointer border-indigo-500 ring-2 ring-indigo-500/20'
                            : 'cursor-pointer border-line hover:border-indigo-400'
                } ${triggerClassName}`}
            >
                <span className={`min-w-0 truncate ${selectedOption ? '' : 'text-faint'}`}>
                    {selectedOption?.label ?? placeholder}
                </span>
                <ChevronDown
                    className={`shrink-0 text-muted transition-transform duration-200 ${sizes.icon} ${isOpen ? 'rotate-180 text-indigo-500' : ''}`}
                    aria-hidden="true"
                />
            </button>

            {mounted && isOpen && position && createPortal(
                <div
                    ref={menuRef}
                    role="listbox"
                    tabIndex={-1}
                    aria-label={ariaLabel}
                    onKeyDown={handleMenuKeyDown}
                    style={{
                        position: 'fixed',
                        top: position.top,
                        left: position.left,
                        width: position.width,
                        maxHeight: MENU_MAX_HEIGHT,
                    }}
                    className="z-[1000] overflow-y-auto rounded-xl border border-line bg-card p-1 shadow-lg outline-none"
                >
                    {options.map((option, index) => {
                        const isSelected = option.value === value;
                        const isActive = index === activeIndex;
                        return (
                            <button
                                key={option.value}
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                onClick={() => commit(index)}
                                onMouseEnter={() => setActiveIndex(index)}
                                className={`flex w-full items-center justify-between text-left transition-colors ${sizes.option} ${
                                    isSelected ? 'bg-accent-soft font-bold text-accent-text' : isActive ? 'bg-app text-fg' : 'text-fg'
                                }`}
                            >
                                <span className="min-w-0 truncate">{option.label}</span>
                                {isSelected && <Check className={`shrink-0 ${sizes.checkIcon}`} aria-hidden="true" />}
                            </button>
                        );
                    })}
                </div>,
                document.body
            )}
        </div>
    );
}
