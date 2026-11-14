const getClassMultiplier = (classType) => {
    const multipliers = {
        '1A': 2,
        '2A': 1.5,
        'CC': 1,
        'SL': 1,
        '2S': 1,
        'EC': 2,
        '3A': 1.2,
        'AC2': 1.5
    };
    return multipliers[classType] || 1;
};

const calculateBookingFare = (train, travelClass, passengerCount = 1) => {
    const classMultiplier = getClassMultiplier(travelClass);
    const baseFarePerPassenger = Math.round(train.baseFare * classMultiplier);
    const count = parseInt(passengerCount, 10) || 1;
    const subtotal = baseFarePerPassenger * count;
    const gst = Math.round(subtotal * 0.18);
    const discount = 0;
    const totalFare = subtotal + gst - discount;

    return {
        baseFare: subtotal,
        passengerCount: count,
        subtotal,
        gst,
        discount,
        totalFare,
        baseFarePerPassenger,
        gstAmount: Math.round(baseFarePerPassenger * 0.18)
    };
};

module.exports = { getClassMultiplier, calculateBookingFare };
