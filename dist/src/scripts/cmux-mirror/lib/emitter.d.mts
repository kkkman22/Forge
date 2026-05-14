/**
 * Emit commands for state transitions (R2.1, R2.2).
 * Returns array of { method, params } objects.
 */
export function emitCommands(prev: any, next: any): ({
    method: string;
    params: {
        text: string;
        icon: any;
        color?: undefined;
        percent?: undefined;
        label?: undefined;
        title?: undefined;
        body?: undefined;
        items?: undefined;
    };
} | {
    method: string;
    params: {
        text: string;
        icon: any;
        color: any;
        percent?: undefined;
        label?: undefined;
        title?: undefined;
        body?: undefined;
        items?: undefined;
    };
} | {
    method: string;
    params: {
        percent: number;
        label: string;
        text?: undefined;
        icon?: undefined;
        color?: undefined;
        title?: undefined;
        body?: undefined;
        items?: undefined;
    };
} | {
    method: string;
    params: {
        title: string;
        body: string;
        text?: undefined;
        icon?: undefined;
        color?: undefined;
        percent?: undefined;
        label?: undefined;
        items?: undefined;
    };
} | {
    method: string;
    params: {
        items: {
            label: string;
            value: any;
            icon: any;
        }[];
        text?: undefined;
        icon?: undefined;
        color?: undefined;
        percent?: undefined;
        label?: undefined;
        title?: undefined;
        body?: undefined;
    };
})[];
