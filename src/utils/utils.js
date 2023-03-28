function deepCopy(obj) {
  const newObj = {};

  for (let key in obj) {
    const value = obj[key];

    if (typeof value === "object" && value !== null) {
      newObj[key] = deepCopy(value); // Recursively copy nested objects
    } else {
      newObj[key] = value; // Copy non-object values as-is
    }
  }

  return newObj;
}

export { deepCopy };
