/**
 * Contains the utility functions.
 */
export class RTMUtils {
  /**
   * Generates a random UUID that is used as Connection Identifiers (CID) and Message IDs.
   * @returns
   */
  static uuidv4() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      function (c) {
        var r = (Math.random() * 16) | 0,
          v = c == "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      }
    );
  }
}
