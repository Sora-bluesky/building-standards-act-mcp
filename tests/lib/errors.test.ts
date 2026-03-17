import { describe, it, expect } from "vitest";
import {
  EgovApiError,
  LawNotFoundError,
  ArticleNotFoundError,
  KokujiNotFoundError,
} from "../../src/lib/errors.js";

describe("EgovApiError", () => {
  it("sets name to 'EgovApiError'", () => {
    const error = new EgovApiError("API request failed");
    expect(error.name).toBe("EgovApiError");
  });

  it("sets the message correctly", () => {
    const error = new EgovApiError("API request failed");
    expect(error.message).toBe("API request failed");
  });

  it("is an instance of Error", () => {
    const error = new EgovApiError("API request failed");
    expect(error).toBeInstanceOf(Error);
  });

  it("sets statusCode and endpoint when provided", () => {
    const error = new EgovApiError("Server error", 500, "/api/laws");
    expect(error.statusCode).toBe(500);
    expect(error.endpoint).toBe("/api/laws");
  });

  it("leaves statusCode and endpoint undefined when not provided", () => {
    const error = new EgovApiError("API request failed");
    expect(error.statusCode).toBeUndefined();
    expect(error.endpoint).toBeUndefined();
  });

  it("allows statusCode without endpoint", () => {
    const error = new EgovApiError("Not found", 404);
    expect(error.statusCode).toBe(404);
    expect(error.endpoint).toBeUndefined();
  });
});

describe("LawNotFoundError", () => {
  it("sets name to 'LawNotFoundError'", () => {
    const error = new LawNotFoundError("建築基準法");
    expect(error.name).toBe("LawNotFoundError");
  });

  it("formats message with the law name", () => {
    const error = new LawNotFoundError("建築基準法");
    expect(error.message).toBe("法令が見つかりません: 建築基準法");
  });

  it("is an instance of Error", () => {
    const error = new LawNotFoundError("建築基準法");
    expect(error).toBeInstanceOf(Error);
  });

  it("stores the lawName property", () => {
    const error = new LawNotFoundError("建築基準法施行令");
    expect(error.lawName).toBe("建築基準法施行令");
  });
});

describe("ArticleNotFoundError", () => {
  it("sets name to 'ArticleNotFoundError'", () => {
    const error = new ArticleNotFoundError("第六条", "建築基準法");
    expect(error.name).toBe("ArticleNotFoundError");
  });

  it("formats message with law name and article number", () => {
    const error = new ArticleNotFoundError("第六条", "建築基準法");
    expect(error.message).toBe("建築基準法の第六条が見つかりません");
  });

  it("is an instance of Error", () => {
    const error = new ArticleNotFoundError("第六条", "建築基準法");
    expect(error).toBeInstanceOf(Error);
  });

  it("stores articleNumber and lawName properties", () => {
    const error = new ArticleNotFoundError("第二十条", "建築基準法施行令");
    expect(error.articleNumber).toBe("第二十条");
    expect(error.lawName).toBe("建築基準法施行令");
  });
});

describe("KokujiNotFoundError", () => {
  it("sets name to 'KokujiNotFoundError'", () => {
    const error = new KokujiNotFoundError("昭和62年建設省告示第1597号");
    expect(error.name).toBe("KokujiNotFoundError");
  });

  it("formats message with the kokuji name", () => {
    const error = new KokujiNotFoundError("昭和62年建設省告示第1597号");
    expect(error.message).toBe(
      "告示が見つかりません: 昭和62年建設省告示第1597号",
    );
  });

  it("is an instance of Error", () => {
    const error = new KokujiNotFoundError("昭和62年建設省告示第1597号");
    expect(error).toBeInstanceOf(Error);
  });

  it("stores the kokujiName property", () => {
    const error = new KokujiNotFoundError("平成12年建設省告示第1347号");
    expect(error.kokujiName).toBe("平成12年建設省告示第1347号");
  });
});
