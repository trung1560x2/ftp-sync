declare module 'node-disk-info' {
    export interface Drive {
        mounted: string;
        filesystem: string;
        blocks: number;
        used: number;
        available: number;
        capacity: string;
    }
    export function getDiskInfo(): Promise<Drive[]>;
    export function getDiskInfoSync(): Drive[];
}
