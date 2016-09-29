//should be internal
namespace ts {
    /**
     * Map from numeric keys to values.
     * Usually this is the builtin Map class.
     * In runtimes without Maps, this is implemented using a sparse array.
     */
    export interface NumberMap<K extends number, V> {
        delete(key: K): void;
        get(key: K): V;
        has(key: K): boolean; //check if ever used
        set(key: K, value: V): void;

        //Ever used?
        forEach(action: (value: V, key: K) => void): void;
    }

    /**
     * Represents a mapping from string keys to values.
     * Usually this is the builtin Map class.
     * In runtimes without Maps, this is implemented using an object in dictionary mode.
     *
     * Internet Explorer does not support iterator-returning methods, so those are not allowed here.
     * But map-using functions in dataStructures.ts check for these features and use them where possible.
     */
    //Note: we shouldn't have publicly exported members of the StringMap type. Use MapLike instead in those situations.
    export interface StringMap<T> {
        clear(): void;
        delete(key: string): void;
        get(key: string): T;
        //TODO: many calls to _has could be replaced by calling '_get' and checking the result
        has(key: string): boolean;
        set(key: string, value: T): void;

        forEach(action: (value: T, key: string) => void): void;
    }

    /** Represents a set of strings.
     * Usually this is the builtin Set class.
     * In runtimes without Sets, this is implemented using a StringMap with dummy values.
     */
    export interface StringSet {
        add(value: string): void;
        has(value: string): boolean;
        delete(value: string): void;
        forEach(action: (value: string) => void): void;
    }
}

//NumberMap and StringMap internal implementation
/* @internal */
namespace ts {
    // The global Map object. This may not be available, so we must test for it.
    declare const Map: NumberMapStatic & StringMapStatic | undefined;
    const usingNativeMaps = typeof Map !== "undefined";

    export interface NumberMapStatic {
        /**
         * Creates a new NumberMap.
         * If `pairs` is provided, each [key, value] pair will be added to the map.
         */
        new<K extends number, V>(pairs?: [K, V][]): NumberMap<K, V>
    }
    export const NumberMap: NumberMapStatic = usingNativeMaps ? Map : class ShimNumberMap<K extends number, V> implements NumberMap<K, V> {
        private data: { [key: number]: V } = {}; //todo: use `[]` instead

        constructor(pairs?: [K, V][]) {
            if (pairs) {
                for (const [key, value] of pairs) {
                    this.data[key as number] = value;
                }
            }
        }

        delete(key: K) {
            delete this.data[key as number];
        }

        get(key: K) {
            return this.data[key as number];
        }

        has(key: K) {
            return (key as number) in this.data;
        }

        set(key: K, value: V) {
            this.data[key as number] = value;
        }

        forEach(action: (value: V, key: K) => void) {
            for (const key in this.data) {
                Debug.assert(typeof key === "number"); //review
                action(this.data[key], key as any as K);
            }
        }
    }



    interface Iterator<T> {
        next(): { value: T, done: false } | { value: never, done: true }
    }

    /** Completes the full ES6 Map spec. Internet Explorer does not provide these methods, so we must provide fallbacks. */
    interface FullyFeaturedMap<T> extends StringMap<T> {
        keys(): Iterator<string>;
        values(): Iterator<T>;
        entries(): Iterator<[string, T]>;
    }
    const fullyFeaturedMaps = usingNativeMaps && "keys" in Map.prototype && "values" in Map.prototype && "entries" in Map.prototype

    export interface StringMapStatic {
        new<T>(): StringMap<T>
    }
    export const StringMap: StringMapStatic = usingNativeMaps ? Map : class ShimStringMap<T> implements StringMap<T> {
        private data: { [key: string]: T } = createDictionaryModeObject();

        constructor() {}

        clear() {
            this.data = createDictionaryModeObject();
        }

        delete(key: string) {
            delete this.data[key];
        }

        get(key: string) {
            return this.data[key];
        }

        has(key: string) {
            return key in this.data;
        }

        set(key: string, value: T) {
            this.data[key] = value;
        }

        forEach(f: (value: T, key: string) => void) {
            for (const key in this.data) {
                f(this.data[key], key);
            }
        }
    };

    //doc
    export function createMapWithEntry<T>(key: string, value: T): StringMap<T> {
        const map = new StringMap<T>();
        map.set(key, value);
        return map;
    }

    //TODO: don't export
    const createObject = Object.create;
    export function createDictionaryModeObject(): any {
        const map = createObject(null); // tslint:disable-line:no-null-keyword

        // Using 'delete' on an object causes V8 to put the object in dictionary mode.
        // This disables creation of hidden classes, which are expensive when an object is
        // constantly changing shape.
        map["__"] = undefined;
        delete map["__"];

        return map;
    }

    //doc
    export function setAndReturn<T>(map: StringMap<T>, key: string, value: T): T {
        map.set(key, value);
        return value;
    }

    //doc
    export const findInMap: <T, U>(map: StringMap<T>, f: (value: T, key: string) => U | undefined) => U | undefined = fullyFeaturedMaps
        ? <T, U>(map: FullyFeaturedMap<T>, f: (value: T, key: string) => U | undefined) => {
            const iter = map.entries();
            while (true) {
                const { value: pair, done } = iter.next();
                if (done) {
                    return undefined;
                }
                const [key, value] = pair;
                const result = f(value, key);
                if (result !== undefined) {
                    return result;
                }
            }
        }
        : <T, U>(map: StringMap<T>, f: (value: T, key: string) => U | undefined) => {
            let result: U | undefined;
            map.forEach((value, key) => {
                if (result === undefined)
                    result = f(value, key);
            });
            return result;
        }

    export const someInMap: <T>(map: StringMap<T>, predicate: (key: string, value: T) => boolean) => boolean = fullyFeaturedMaps
        ? <T>(map: FullyFeaturedMap<T>, predicate: (key: string, value: T) => boolean) =>
            someInIterator(map.entries(), ([key, value]) => predicate(key, value))
        : <T>(map: StringMap<T>, predicate: (key: string, value: T) => boolean) => {
            let found = false;
            map.forEach((value, key) => {
                found = found || predicate(key, value);
            });
            return found;
        };

    export const _eachAndBreakIfReturningTrue: <T>(map: StringMap<T>, action: (key: string, value: T) => boolean) => void = someInMap;

    export const someKeyInMap: (map: StringMap<any>, predicate: (key: string) => boolean) => boolean = fullyFeaturedMaps
        ? (map: FullyFeaturedMap<any>, predicate: (key: string) => boolean) => someInIterator(map.keys(), predicate)
        : someInMap;

    //only used in one place, kill? Write in terms of _someEntry?
    export const someValueInMap: <T>(map: StringMap<T>, predicate: (value: T) => boolean) => boolean = fullyFeaturedMaps
        ? <T>(map: FullyFeaturedMap<T>, predicate: (value: T) => boolean) =>
            someInIterator(map.values(), predicate)
        : <T>(map: StringMap<T>, predicate: (value: T) => boolean) =>
            someInMap(map, (key, value) => predicate(value));

    function someInIterator<T>(iter: Iterator<T>, predicate: (value: T) => boolean): boolean {
        while (true) {
            const { value, done } = iter.next();
            if (done) {
                return false;
            }
            if (predicate(value)) {
                return true;
            }
        }
    }

    /** Equivalent to the ES6 code `for (const key of map.keys()) action(key)` */
    export const forEachKeyInMap: (map: StringMap<any>, action: (key: string) => void) => void = fullyFeaturedMaps
        ? (map: FullyFeaturedMap<any>, f: (key: string) => void) => {
            const iter: Iterator<string> = map.keys();
            while (true) {
                const { value: key, done } = iter.next();
                if (done) {
                    return;
                }
                f(key);
            }
        }
        : (map, action) => {
            map.forEach((_value, key) => action(key))
        };
}

//Map extensions: don't depend on internal details
/* @internal */
namespace ts {
    //document
    export function sortInV8ObjectInsertionOrder<T>(values: T[], toKey: (t: T) => string): T[] {
        const naturals: T[] = []; //name
        const everythingElse: T[] = [];
        for (const value of values) {
            // "0" looks like a natural but "08" doesn't.
            const looksLikeNatural = /^(0|([1-9]\d*))$/.test(toKey(value));
            (looksLikeNatural ? naturals : everythingElse).push(value);
        }
        function toInt(value: T): number {
            return parseInt(toKey(value), 10);
        }
        naturals.sort((a, b) => toInt(a) - toInt(b));
        return naturals.concat(everythingElse);
    }

    export function mapIsEmpty(map: StringMap<any>): boolean {
        return !someKeyInMap(map, () => true);
    }

    export function mapOfMapLike<T>(object: MapLike<T>) {
        const map = new StringMap<T>();
        // Copies keys/values from template. Note that for..in will not throw if
        // template is undefined, and instead will just exit the loop.
        for (const key in object) if (hasProperty(object, key)) {
            map.set(key, object[key]);
        }
        return map;
    }

    export function mapLikeOfMap<T>(map: StringMap<T>): MapLike<T> {
        const obj = createDictionaryModeObject();
        map.forEach((value, key) => {
            obj[key] = value;
        });
        return obj;
    }

    export function _mod<T>(map: StringMap<T>, key: string, modifier: (value: T) => T) {
        map.set(key, modifier(map.get(key)));
    }

    export function cloneMap<T>(map: StringMap<T>) {
        const clone = new StringMap<T>();
        copyMapPropertiesFromTo(map, clone);
        return clone;
    }

    /**
     * Performs a shallow copy of the properties from a source Map<T> to a target Map<T>
     *
     * @param source A map from which properties should be copied.
     * @param target A map to which properties should be copied.
     */
    //rename : "entries", not "properties"
    export function copyMapPropertiesFromTo<T>(source: StringMap<T>, target: StringMap<T>): void {
        source.forEach((value, key) => {
            target.set(key, value);
        });
    }

    //move
    export function copySetValuesFromTo<T>(source: StringSet, target: StringSet): void {
        source.forEach(value => target.add(value));
    }

    //kill?
    /**
     * Reduce the properties of a map.
     *
     * NOTE: This is intended for use with Map<T> objects. For MapLike<T> objects, use
     *       reduceOwnProperties instead as it offers better runtime safety.
     *
     * @param map The map to reduce
     * @param callback An aggregation function that is called for each entry in the map
     * @param initial The initial value for the reduction.
     */
    export function reduceProperties<T, U>(map: StringMap<T>, callback: (aggregate: U, value: T, key: string) => U, initial: U): U {
        let result = initial;
        map.forEach((value, key) => {
            result = callback(result, value, String(key)); //why cast to string???
        });
        return result;
    }

    export function _mapValuesMutate<T>(map: StringMap<T>, mapValue: (value: T) => T): void {
        map.forEach((value, key) => {
            map.set(key, mapValue(value));
        });
    }

    export function _ownKeys<T>(map: StringMap<T>): string[] {
        const keys: string[] = [];
        forEachKeyInMap(map, key => {
            keys.push(key);
        });
        return keys;
    }

    export function _getOrUpdate<T>(map: StringMap<T>, key: string, getValue: (key: string) => T): T {
        return map.has(key) ? map.get(key) : setAndReturn(map, key, getValue(key));
    }

    /**
     * Creates a map from the elements of an array.
     *
     * @param array the array of input elements.
     * @param makeKey a function that produces a key for a given element.
     *
     * This function makes no effort to avoid collisions; if any two elements produce
     * the same key with the given 'makeKey' function, then the element with the higher
     * index in the array will be the one associated with the produced key.
     */
    export function arrayToMap<T>(array: T[], makeKey: (value: T) => string): StringMap<T>;
    export function arrayToMap<T, U>(array: T[], makeKey: (value: T) => string, makeValue: (value: T) => U): StringMap<U>;
    export function arrayToMap<T, U>(array: T[], makeKey: (value: T) => string, makeValue?: (value: T) => U): StringMap<T | U> {
        const result = new StringMap<T | U>();
        for (const value of array) {
            result.set(makeKey(value), makeValue ? makeValue(value) : value);
        }
        return result;
    }

    /**
     * Adds the value to an array of values associated with the key, and returns the array.
     * Creates the array if it does not already exist.
     */
    export function multiMapAdd<V>(map: StringMap<V[]>, key: string, value: V): V[] {
        const values = map.get(key);
        if (values) {
            values.push(value);
            return values;
        }
        else {
            return setAndReturn(map, key, [value]);
        }
    }

    /**
     * Removes a value from an array of values associated with the key.
     * Does not preserve the order of those values.
     * Does nothing if `key` is not in `map`, or `value` is not in `map[key]`.
     */
    export function multiMapRemove<V>(map: StringMap<V[]>, key: string, value: V): void {
        const values = map.get(key);
        if (values) {
            unorderedRemoveItem(values, value);
            if (!values.length) {
                map.delete(key);
            }
        }
    }

    //todo: neater
    export function _equalMaps<T>(left: StringMap<T>, right: StringMap<T>, equalityComparer?: (left: T, right: T) => boolean) {
        if (left === right) return true;
        if (!left || !right) return false;
        const someInLeftHasNoMatch = someInMap(left, (leftKey, leftValue) => {
            if (!right.has(leftKey)) return true;
            const rightValue = right.get(leftKey);
            return !(equalityComparer ? equalityComparer(leftValue, rightValue) : leftValue === rightValue);
        });
        if (someInLeftHasNoMatch) return false;
        const someInRightHasNoMatch = someKeyInMap(right, rightKey => !left.has(rightKey));
        return !someInRightHasNoMatch;
    }
}


/* @internal */
namespace ts {
    class ShimStringSet implements StringSet {
        private data: { [value: string]: true };

        constructor() {
            this.data = createDictionaryModeObject();
        }

        add(value: string) {
            this.data[value] = true;
        }

        has(value: string) {
            return value in this.data;
        }

        delete(value: string) {
            delete this.data[value];
        }

        forEach(action: (value: string) => void) {
            for (const value in this.data) {
                action(value);
            }
        }

        isEmpty() {
            for (const value in this.data) {
                return false;
            }
            return true;
        }
    }

    declare const Set: { new(): StringSet } | undefined;
    const usingNativeSets = typeof Set !== "undefined";
    export const StringSet: { new(): StringSet } = usingNativeSets ? Set : ShimStringSet;

    export const setIsEmpty: (set: StringSet) => boolean = usingNativeSets
        ? set => (set as any).size === 0
        : (set: ShimStringSet) => set.isEmpty()
}

//MAPLIKE
/* @internal */
namespace ts {
    const hasOwnProperty = Object.prototype.hasOwnProperty; //neater

    export function clone<T>(object: T): T {
        const result: any = {};
        for (const id in object) {
            if (hasOwnProperty.call(object, id)) {
                result[id] = (<any>object)[id];
            }
        }
        return result;
    }

    /**
     * Indicates whether a map-like contains an own property with the specified key.
     *
     * NOTE: This is intended for use only with MapLike<T> objects. For Map<T> objects, use
     *       the 'in' operator.
     *
     * @param map A map-like.
     * @param key A property key.
     */
    export function hasProperty<T>(map: MapLike<T>, key: string): boolean {
        return hasOwnProperty.call(map, key);
    }

    /**
     * Gets the value of an owned property in a map-like.
     *
     * NOTE: This is intended for use only with MapLike<T> objects. For Map<T> objects, use
     *       an indexer.
     *
     * @param map A map-like.
     * @param key A property key.
     */
    export function getProperty<T>(map: MapLike<T>, key: string): T | undefined {
        return hasOwnProperty.call(map, key) ? map[key] : undefined;
    }

    /**
     * Gets the owned, enumerable property keys of a map-like.
     *
     * NOTE: This is intended for use with MapLike<T> objects. For Map<T> objects, use
     *       Object.keys instead as it offers better performance.
     *
     * @param map A map-like.
     */
    export function getOwnKeys<T>(map: MapLike<T>): string[] {
        const keys: string[] = [];
        for (const key in map) if (hasOwnProperty.call(map, key)) {
            keys.push(key);
        }
        return keys;
    }

    export function assign<T1 extends MapLike<{}>, T2, T3>(t: T1, arg1: T2, arg2: T3): T1 & T2 & T3;
    export function assign<T1 extends MapLike<{}>, T2>(t: T1, arg1: T2): T1 & T2;
    export function assign<T1 extends MapLike<{}>>(t: T1, ...args: any[]): any;
    export function assign<T1 extends MapLike<{}>>(t: T1, ...args: any[]) {
        for (const arg of args) {
            for (const p of getOwnKeys(arg)) {
                t[p] = arg[p];
            }
        }
        return t;
    }

    /**
     * Reduce the properties defined on a map-like (but not from its prototype chain).
     *
     * NOTE: This is intended for use with MapLike<T> objects. For Map<T> objects, use
     *       reduceProperties instead as it offers better performance.
     *
     * @param map The map-like to reduce
     * @param callback An aggregation function that is called for each entry in the map
     * @param initial The initial value for the reduction.
     */
    export function reduceOwnProperties<T, U>(map: MapLike<T>, callback: (aggregate: U, value: T, key: string) => U, initial: U): U {
        let result = initial;
        for (const key in map) if (hasOwnProperty.call(map, key)) {
            result = callback(result, map[key], String(key));
        }
        return result;
    }

    /**
     * Performs a shallow equality comparison of the contents of two map-likes.
     *
     * @param left A map-like whose properties should be compared.
     * @param right A map-like whose properties should be compared.
     */
    export function equalOwnProperties<T>(left: MapLike<T>, right: MapLike<T>, equalityComparer?: (left: T, right: T) => boolean) {
        if (left === right) return true;
        if (!left || !right) return false;
        for (const key in left) if (hasOwnProperty.call(left, key)) {
            if (!hasOwnProperty.call(right, key) === undefined) return false;
            if (equalityComparer ? !equalityComparer(left[key], right[key]) : left[key] !== right[key]) return false;
        }
        for (const key in right) if (hasOwnProperty.call(right, key)) {
            if (!hasOwnProperty.call(left, key)) return false;
        }
        return true;
    }

    export function extend<T1, T2>(first: T1 , second: T2): T1 & T2 {
        const result: T1 & T2 = <any>{};
        for (const id in second) if (hasOwnProperty.call(second, id)) {
            (result as any)[id] = (second as any)[id];
        }
        for (const id in first) if (hasOwnProperty.call(first, id)) {
            (result as any)[id] = (first as any)[id];
        }
        return result;
    }
}
