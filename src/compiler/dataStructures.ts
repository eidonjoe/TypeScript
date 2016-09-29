//TODO: move this back to types.ts
namespace ts {
    export interface MapLike<T> {
        [index: string]: T;
    }

    /**
     * Represents a mapping from string keys to values.
     * This is an abstract data type: only functions in dataStructures.ts should use the internal representation of Maps.
     * The internal representation depends on whether the native Map class is available.
     */
    //Note: we shouldn't have publicly exported members of the StringMap type. Use MapLike instead in those situations.
    export interface StringMap<T> {
        // Ensure that Map<string> and Map<number> are incompatible
        //__mapBrand: T;

        clear(): void;
        delete(key: string): void;
        get(key: string): T;
        //TODO: many calls to _has could be replaced by calling '_get' and checking the result
        has(key: string): boolean;
        set(key: string, value: T): void;

        forEach(f: (value: T, key: string) => void): void;
    }
}

//sort me
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
}

/* @internal */
//map implementation
namespace ts {
    interface Iterator<T> { //TODO: don't export
        next(): { value: T, done: boolean }; //TODO: LKG updated, so use { value: T, done: false } | { value: never, done: true }
    }

    declare const Map: { new<T>(): StringMap<T> } | undefined;
    const useNativeMaps = typeof Map !== "undefined";

    //We must feature-detect for these methods.
    interface FullyFeaturedMap<T> extends StringMap<T> {
        keys(): Iterator<string>;
        values(): Iterator<T>;
        entries(): Iterator<[string, T]>;
    }
    const fullyFeaturedMaps = useNativeMaps && "keys" in Map.prototype && "values" in Map.prototype && "entries" in Map.prototype

    export const StringMap: { new<T>(): StringMap<T> } = useNativeMaps ? Map : class ShimMap<T> implements StringMap<T> {
        private data: { [key: string]: T };

        constructor() {
            this.data = createDictionaryModeObject();
        }

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

    const createObject = Object.create;
    const hasOwnProperty = Object.prototype.hasOwnProperty;

    //export const createMap: <T>() => Map<T> = realMaps
    //    ? <T>() => new Map<T>()
    //    : createDictionaryModeObject;

    //rename, move
    //TODO: just use `new StringMap([[key, value]])?
    export function createMapWithEntry<T>(key: string, value: T): StringMap<T> {
        const map = new StringMap<T>();
        map.set(key, value);
        return map;
    }

    //move
    export function createMapFromMapLike<T>(template: MapLike<T>) {
        const map = new StringMap<T>();
        // Copies keys/values from template. Note that for..in will not throw if
        // template is undefined, and instead will just exit the loop.
        for (const key in template) if (hasOwnProperty.call(template, key)) {
            map.set(key, template[key]);
        }
        return map;
    }

    //TODO: don't export
    export function createDictionaryModeObject(): any {
        const map = createObject(null); // tslint:disable-line:no-null-keyword

        // Using 'delete' on an object causes V8 to put the object in dictionary mode.
        // This disables creation of hidden classes, which are expensive when an object is
        // constantly changing shape.
        map["__"] = undefined;
        delete map["__"];

        return map;
    }

    export function setAndReturn<T>(map: StringMap<T>, key: string, value: T): T {
        map.set(key, value);
        return value;
    }

    export const _find: <T, U>(map: StringMap<T>, f: (key: string, value: T) => U | undefined) => U | undefined = fullyFeaturedMaps
        ? <T, U>(map: FullyFeaturedMap<T>, f: (key: string, value: T) => U | undefined) => {
            const iter = map.entries();
            while (true) {
                const { value: pair, done } = iter.next();
                if (done) {
                    return undefined;
                }
                const [key, value] = pair;
                const result = f(key, value);
                if (result !== undefined) {
                    return result;
                }
            }
        }
        : <T, U>(map: StringMap<T>, f: (key: string, value: T) => U | undefined) => {
            let result: U | undefined;
            map.forEach((value, key) => {
                if (result === undefined)
                    result = f(key, value);
            });
            return result;
        }

    export const _someEntry: <T>(map: StringMap<T>, predicate: (key: string, value: T) => boolean) => boolean = fullyFeaturedMaps
        ? <T>(map: FullyFeaturedMap<T>, predicate: (key: string, value: T) => boolean) => {
            const iter = map.entries();
            while (true) {
                const { value: pair, done } = iter.next();
                if (done) {
                    return false;
                }
                const [key, value] = pair;
                if (predicate(key, value)) {
                    return true;
                }
            }
        }
        : <T>(map: StringMap<T>, predicate: (key: string, value: T) => boolean) => {
            let found = false;
            map.forEach((value, key) => {
                found = found || predicate(key, value);
            });
            return found;
        };

    export const _someKey: (map: StringMap<any>, predicate: (key: string) => boolean) => boolean = fullyFeaturedMaps
        ? (map: FullyFeaturedMap<any>, predicate: (key: string) => boolean) => {
            const iter: Iterator<string> = map.keys();
            while (true) {
                const { value: key, done } = iter.next();
                if (done) {
                    return false;
                }
                if (predicate(key)) {
                    return true;
                }
            }
        }
        : _someEntry;

    //only used in one place, kill? Write in terms of _someEntry?
    export const _someValue: <T>(map: StringMap<T>, predicate: (value: T) => boolean) => boolean = fullyFeaturedMaps
        ? <T>(map: FullyFeaturedMap<T>, predicate: (value: T) => boolean) => {
            const iter = map.values();
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
        : <T>(map: StringMap<T>, predicate: (value: T) => boolean) =>
            _someEntry(map, (key, value) => predicate(value));


    export const _eachKey: (map: StringMap<any>, f: (key: string) => void) => void = fullyFeaturedMaps
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
        : (map: StringMap<any>, f: (key: string) => void) => {
            map.forEach((value, key) => f(key))
        };

    //consider using _find
    export const _eachAndBreakIfReturningTrue: <T>(map: StringMap<T>, f: (key: string, value: T) => boolean) => void = fullyFeaturedMaps
        ? <T>(map: FullyFeaturedMap<T>, f: (key: string, value: T) => boolean) => {
            const iter = map.entries();
            while (true) {
                const { value: pair, done } = iter.next();
                if (done) {
                    return;
                }
                const [key, value] = pair;
                f(key, value);
            }
        }
        : <T>(map: StringMap<T>, f: (key: string, value: T) => boolean) => {
            let didBreak = false
            map.forEach((value, key) => {
                didBreak = didBreak || f(key, value)
            });
        };

    //reconsider
    export const _eachValue: <T>(map: StringMap<T>, f: (value: T) => void) => void = fullyFeaturedMaps
        ? <T>(map: FullyFeaturedMap<T>, f: (value: T) => void) => {
            const iter = map.values();
            while (true) {
                const { value, done } = iter.next();
                if (done) {
                    return;
                }
                f(value);
            }
            //map.forEach(f);
        }
        : <T>(map: StringMap<T>, f: (value: T) => void) => {
            map.forEach(f);
        };

    export function _toMapLike<T>(map: StringMap<T>): MapLike<T> {
        const obj = createDictionaryModeObject();
        map.forEach((value, key) => {
            obj[key] = value;
        });
        return obj;
    }

    //reconsider, and rename
    //This is basically the same as _find
    export const _findMapValue: <T, U>(map: StringMap<T>, f: (value: T) => U | undefined) => U | undefined = fullyFeaturedMaps
        ? <T, U>(map: FullyFeaturedMap<T>, f: (value: T) => U | undefined) => {
            const iter = map.values();
            while (true) {
                const { value, done } = iter.next();
                if (done) {
                    return undefined;
                }
                const result = f(value);
                if (result !== undefined) {
                    return result;
                }
            }
        }
        : <T, U>(map: StringMap<T>, f: (value: T) => U | undefined) => {
            let result: U | undefined;
            map.forEach(value => {
                if (result === undefined)
                    result = f(value);
            });
            return result;
        };
}


//Map extensions: don't depend on internal details
/* @internal */
namespace ts {
    export function isEmpty<T>(map: StringMap<T>): boolean {
        return !_someKey(map, () => true);
    }

    //Use a NumberMap type instead
    export function _deleteWakka(map: StringMap<any>, key: any): void {
        map.delete(key.toString());
    }
    export function _hasWakka(map: StringMap<any>, key: any): boolean {
        return map.has(key.toString());
    }
    export function _getWakka<T>(map: StringMap<T>, key: any): T {
        return map.get(key.toString());
    }
    export function _setWakka<T>(map: StringMap<T>, key: any, value: T): T {
        return setAndReturn(map, key.toString(), value);
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
        _eachKey(map, key => {
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
        const someInLeftHasNoMatch = _someEntry(left, (leftKey, leftValue) => {
            if (!right.has(leftKey)) return true;
            const rightValue = right.get(leftKey);
            return !(equalityComparer ? equalityComparer(leftValue, rightValue) : leftValue === rightValue);
        });
        if (someInLeftHasNoMatch) return false;
        const someInRightHasNoMatch = _someKey(right, rightKey => !left.has(rightKey));
        return !someInRightHasNoMatch;
    }
}


/* @internal */
namespace ts {
    //rename to StringSet
    export interface StringSet {
        readonly size: number;
        add(value: string): void;
        has(value: string): boolean;
        delete(value: string): void;
        forEach(f: (value: string) => void): void;
    }

    declare const Set: { new(): StringSet } | undefined;
    export const StringSet: { new(): StringSet } = typeof Set !== "undefined" ? Set : class ShimSet implements StringSet {
        data: { [value: string]: true };
        size: number;

        constructor() {
            this.data = createDictionaryModeObject();
            this.size = 0;
        }

        add(value: string) {
            if (!this.has(value)) {
                this.data[value] = true;
                this.size++;
            }
        }

        has(value: string) {
            return value in this.data;
        }

        delete(value: string) {
            if (this.has(value)) {
                delete this.data[value];
                this.size--;
            }
        }

        forEach(f: (value: string) => void) {
            for (const value in this.data)
                f(value);
        }

        //Won't work because we're not targeting ES5???
        //get size() {
        //    let size = 0;
        //    for (const value in this.data)
        //        size++;
        //    return size;
        //}
    }

    export function _setIsEmpty(set: StringSet): boolean {
        return set.size === 0
    }
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
