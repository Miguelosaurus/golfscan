export default ({ config }) => {
    const IS_DEV = process.env.APP_VARIANT === 'development';
    const IS_STAGING = process.env.APP_VARIANT === 'staging';

    return {
        ...config,
        name: IS_DEV ? 'SCAN-DEV' : IS_STAGING ? 'ScanCaddie (Staging)' : 'ScanCaddie',
        scheme: IS_DEV ? 'scancaddie-dev' : IS_STAGING ? 'scancaddie-staging' : 'myapp',
        ios: {
            ...config.ios,
            bundleIdentifier: IS_DEV
                ? 'com.golfscanai.app.dev'
                : IS_STAGING
                    ? 'com.golfscanai.app.staging'
                    : 'com.golfscanai.app',
        },
        android: {
            ...config.android,
            package: IS_DEV
                ? 'com.golfscanai.app.dev'
                : IS_STAGING
                    ? 'com.golfscanai.app.staging'
                    : 'com.golfscanai.app',
        },
    };
};
