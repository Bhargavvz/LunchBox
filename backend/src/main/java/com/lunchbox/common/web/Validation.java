package com.lunchbox.common.web;

public final class Validation {

    /** Indian mobile number in E.164 form. */
    public static final String INDIAN_MOBILE = "^\\+91[6-9]\\d{9}$";
    public static final String PINCODE = "^[1-9]\\d{5}$";
    public static final String IFSC = "^[A-Z]{4}0[A-Z0-9]{6}$";
    public static final String VEHICLE_NUMBER = "^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{1,4}$";
    /** Names: letters (any script), spaces, dot, apostrophe, hyphen. */
    public static final String PERSON_NAME = "^[\\p{L}\\p{M} .'-]{1,80}$";

    private Validation() {
    }

    /** Masks a phone number for display to people who must not see it (e.g. +91 98XXXXXX10). */
    public static String maskPhone(String phone) {
        if (phone == null || phone.length() < 6) {
            return null;
        }
        String digits = phone.startsWith("+91") ? phone.substring(3) : phone;
        if (digits.length() < 4) {
            return "XXXX";
        }
        return "+91 " + digits.substring(0, 2) + "X".repeat(digits.length() - 4) + digits.substring(digits.length() - 2);
    }
}
