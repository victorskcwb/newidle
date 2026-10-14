import { v7 } from 'uuid';

/** UUID v7: time-ordered, so new rows append to the end of indexes. */
export const newId = (): string => v7();
