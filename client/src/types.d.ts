declare module '@paper-design/shaders-react' {
    import { ComponentType, HTMLAttributes } from 'react';

    export interface DitheringProps extends HTMLAttributes<HTMLDivElement> {
        colorBack?: string;
        colorFront?: string;
        shape?: string;
        type?: string;
        speed?: number;
        minPixelRatio?: number;
        className?: string;
    }

    export const Dithering: ComponentType<DitheringProps>;
}
