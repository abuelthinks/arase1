"use client";

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

interface Option {
    value: string;
    label: string;
}

interface CustomSelectProps {
    value: string;
    onChange: (value: string) => void;
    options: Option[];
    disabled?: boolean;
}

export default function CustomSelect({ value, onChange, options, disabled }: CustomSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedOption = options.find(o => o.value === value) || options[0];

    return (
        <div className="relative w-full" ref={dropdownRef}>
            <button
                type="button"
                disabled={disabled}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsOpen(!isOpen); }}
                className={`w-full flex items-center justify-between px-3 py-2.5 bg-slate-50 border ${isOpen ? 'border-indigo-500 ring-2 ring-indigo-500/20' : 'border-slate-300'} rounded-xl text-slate-800 text-sm font-medium transition-all ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-indigo-400'}`}
                style={{ height: "42px" }}
            >
                <span>{selectedOption?.label}</span>
                <ChevronDown 
                    className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${isOpen ? 'rotate-180 text-indigo-500' : ''}`}
                />
            </button>

            {isOpen && (
                <div 
                    className="absolute z-[1000] w-full mt-2 bg-white border border-indigo-200 rounded-xl shadow-[0_10px_25px_-5px_rgba(79,70,229,0.15)] overflow-hidden"
                    style={{ transformOrigin: "top" }}
                >
                    {options.map((option, index) => {
                        const isSelected = value === option.value;
                        const isFirst = index === 0;
                        const isLast = index === options.length - 1;
                        
                        let borderClasses = 'border-transparent';
                        if (isSelected) {
                            if (options.length === 1) {
                                borderClasses = 'border-transparent';
                            } else if (isFirst) {
                                borderClasses = 'border-t-transparent border-b-indigo-200';
                            } else if (isLast) {
                                borderClasses = 'border-t-indigo-200 border-b-transparent';
                            } else {
                                borderClasses = 'border-indigo-200';
                            }
                        }

                        return (
                            <button
                                key={option.value}
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    onChange(option.value);
                                    setIsOpen(false);
                                }}
                                className={`w-full flex items-center justify-between px-4 py-2.5 text-sm text-left transition-colors border-y ${isSelected ? `bg-indigo-50 text-indigo-700 font-bold ${borderClasses}` : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900 border-transparent'}`}
                            >
                                <span>{option.label}</span>
                                {isSelected && <Check className="w-4 h-4 text-indigo-600" />}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
