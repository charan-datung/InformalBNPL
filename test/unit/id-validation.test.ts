import { describe, it, expect } from "vitest";
import { validateIdNumber } from "@/lib/profiles/id-validation";

describe("validateIdNumber", () => {
  it("accepts a 16-digit PhilSys, ignoring separators", () => {
    expect(validateIdNumber("PhilSys (National ID)", "1234-5678-9012-3456")).toBeNull();
    expect(validateIdNumber("PhilSys (National ID)", "1234 5678 9012 3456")).toBeNull();
  });

  it("rejects a wrong-length PhilSys", () => {
    expect(validateIdNumber("PhilSys (National ID)", "12345")).toMatch(/16 digits/);
  });

  it("validates driver's license and passport shapes", () => {
    expect(validateIdNumber("Driver's License", "N01-23-456789")).toBeNull();
    expect(validateIdNumber("Passport", "P1234567A")).toBeNull();
    expect(validateIdNumber("Passport", "notapassport")).not.toBeNull();
  });

  it("requires a value, and is lenient for unmapped/Other types", () => {
    expect(validateIdNumber("PhilSys (National ID)", "")).toMatch(/required/);
    expect(validateIdNumber("Other", "ABC123")).toBeNull();
    expect(validateIdNumber("Other", "x")).not.toBeNull();
  });
});
