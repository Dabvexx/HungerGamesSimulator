/** The ASCII code of the character `0`. */
export const char_zero = '0'.charCodeAt(0)

/** The ASCII code of the character `9`. */
export const char_nine = '9'.charCodeAt(0)

/** Using a predicate, check if two arrays are equal. */
export function ArraysEqual<T, U>(ts: T[], us: U[], predicate: (t: T, u: U) => boolean) {
    if (ts.length !== us.length) return false
    for (let i = 0; i < ts.length; i++)
        if (!predicate(ts[i], us[i]))
            return false
    return true
}

/** Prompt the user to download a file.
 *
 * @param filename The name that the file should have.
 * @param url The URL of the file.
 * */
export function DownloadURL(filename: string, url: string) {
    let a = document.createElement('a')
    a.setAttribute('href', url)
    a.setAttribute('download', filename)
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    a.remove()
}

/** Create a data URL for an object's JSON representation. */
export function ObjectToDataURL(obj: any) {
    return 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(obj, null, 4))
}

/** Create a Blob from a string */
export function StringToBlob(str: string, mime_type: string = "application/json"): Blob {
    return new Blob([str], {type: mime_type})
}

/** Convert a string to Title Case. */
export function TitleCase(str: string): string {
    return str.toLowerCase().replace(/\b\w/g, l => l.toUpperCase())
}

/** Create a Blob from a string */
export function StringToObjectURL(str: string, mime_type: string = "application/json"): string {
    return URL.createObjectURL(StringToBlob(str, mime_type))
}

/** Clamp a number **/
export function clamp(x: number, lo: number, hi: number): number {
    return Math.min(Math.max(x, lo), hi)
}

/**
 * Check if an object is of a given type.
 *
 * The object must be of that exact type. This will return
 * `false` if the object is of a subtype of the type.
 */
export function has_type(o: any, type: Function): boolean {
    return typeof o === 'object' && o && o.constructor === type
}

/** Check if a character is between `'0'` and `'9'`. */
export function isdigit(char: string): boolean {
    let c = char.charCodeAt(0)
    return c >= char_zero && c <= char_nine
}

/** Generate a random integer in `[from;to[`. */
export function randomInt(from: number, to: number): number {
    return Math.floor(Math.random() * (to - from)) + from
}

/** Randomise the order of elements in an array in place. */
export function shuffle<T>(array: T[]): T[] {
    if (array.length < 2) return array;
    for (let i = array.length - 1; i > 0; i--) {
        let j = randomInt(0, i)
        let k = array[i]
        array[i] = array[j]
        array[j] = k
    }
    return array;
}