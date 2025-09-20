import { default as React } from '../../../../../node_modules/react';
export interface EligibilityState {
    isEligible: boolean;
    setEligible: React.Dispatch<React.SetStateAction<boolean>>;
}
export declare const EligibilityProvider: React.FC<{
    children: React.ReactNode;
}>;
export declare const useEligibilityContext: () => EligibilityState;
