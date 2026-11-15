package com.lunchbox.children;

import java.util.UUID;

/**
 * The mark a family puts on their child's lunchbox, in the spirit of the codes Mumbai's dabbawalas paint on tiffin
 * lids: two letters and two digits (for example {@code KT47}). The parent app shows it so it can be written on the
 * lid; the partner app shows the same code at pickup and at the school gate, so boxes for children with the same
 * first name are never swapped.
 *
 * <p>It is derived from the child's id, so it needs no storage, never changes for a child and reveals nothing about
 * them. Letters and digits that are easily misread when handwritten (I, O, Q, 0, 1) are not used. A code is not
 * unique across the platform (33,856 combinations); it only has to tell apart the handful of boxes on one route,
 * where it is always shown next to the child's first name and class.
 */
public final class BoxCode {

    private static final char[] LETTERS = "ABCDEFGHJKLMNPRSTUVWXYZ".toCharArray();
    private static final char[] DIGITS = "23456789".toCharArray();

    private BoxCode() {
    }

    public static String of(UUID childId) {
        if (childId == null) {
            return null;
        }
        long h = mix(childId.getMostSignificantBits() ^ Long.rotateLeft(childId.getLeastSignificantBits(), 31));
        char[] out = new char[4];
        out[0] = LETTERS[(int) Long.remainderUnsigned(h, LETTERS.length)];
        h = Long.divideUnsigned(h, LETTERS.length);
        out[1] = LETTERS[(int) Long.remainderUnsigned(h, LETTERS.length)];
        h = Long.divideUnsigned(h, LETTERS.length);
        out[2] = DIGITS[(int) Long.remainderUnsigned(h, DIGITS.length)];
        h = Long.divideUnsigned(h, DIGITS.length);
        out[3] = DIGITS[(int) Long.remainderUnsigned(h, DIGITS.length)];
        return new String(out);
    }

    /** SplitMix64 finaliser: spreads the time-ordered bits of a UUIDv7 evenly over the code space. */
    private static long mix(long z) {
        z = (z ^ (z >>> 30)) * 0xBF58476D1CE4E5B9L;
        z = (z ^ (z >>> 27)) * 0x94D049BB133111EBL;
        return z ^ (z >>> 31);
    }
}
