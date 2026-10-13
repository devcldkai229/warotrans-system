export type ClassValue = string | false | null | undefined

/** Joins class names, skipping the falsy ones: `cx('a', open && 'b')`. */
export const cx = (...values: ClassValue[]) => values.filter(Boolean).join(' ')
