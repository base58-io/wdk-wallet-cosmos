export declare const IBC_CHAIN_1_CONFIG: {
    rpcEndpoints: string[];
    addressPrefix: string;
    nativeDenom: string;
    gasPrice: string;
    ibcChannels: {
        wdk2: {
            sourceChannel: string;
        };
    };
};
export declare const IBC_CHAIN_2_CONFIG: {
    rpcEndpoints: string[];
    addressPrefix: string;
    nativeDenom: string;
    gasPrice: string;
    ibcChannels: {
        wdk: {
            sourceChannel: string;
        };
    };
};
export declare const ALICE_MNEMONIC = "car knock victory oval pulse practice draw bulb fiction bulb involve dumb stairs discover update spatial blouse perfect match property wheat defense host fortune";
export declare const BOB_MNEMONIC = "banner spread envelope side kite person disagree path silver will brother under couch edit food venture squirrel civil budget number acquire point work mass";
export declare const INVALID_MNEMONIC = "invalid seed phrase that should not work";
export declare const ALICE_SEED: Buffer<ArrayBufferLike>;
export declare const ALICE_ADDRESS = "wdk1jvjy9gpu95k9uaez7ncydkaurcqpcpye7znlz5";
export declare const BOB_ADDRESS = "wdk1m9l358xunhhwds0568za49mzhvuxx9uxv52xme";
export declare const BOB_ADDRESS_CHAIN_2 = "wdk21m9l358xunhhwds0568za49mzhvuxx9uxs7puwd";
export declare const DEFAULT_TEST_GAS_PRICE_AMOUNT = 0.025;
/** Derives the `ibc/<hash>` denom a base denom takes on after one hop. */
export declare function resolveIbcDenom(sourceChannel: string, baseDenom: string): string;
