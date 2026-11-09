// Web stand-in for react-native-razorpay: the native checkout does not exist in a browser.
export default {
  open: () => Promise.reject(new Error('Online payment is only available in the phone app.')),
};
