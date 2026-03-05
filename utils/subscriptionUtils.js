function getEffectiveSubscription(user) {
    if (!user) return { subscriptionTier: 'free', isSubscribed: false, subscriptionStatus: 'none' };
    const now = new Date();
    const exp = user.subscriptionExpirationDate ? new Date(user.subscriptionExpirationDate) : null;
    const status = user.subscriptionStatus || 'none';
    if (status === 'active' && exp != null && exp <= now) {
        return {
            subscriptionTier: 'free',
            isSubscribed: false,
            subscriptionStatus: 'expired',
        };
    }
    return {
        subscriptionTier: user.subscriptionTier || 'free',
        isSubscribed: user.isSubscribed || false,
        subscriptionStatus: user.subscriptionStatus || 'none',
    };
}

module.exports = { getEffectiveSubscription };
