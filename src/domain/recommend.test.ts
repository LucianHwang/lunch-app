import { describe, expect, it } from "vitest";
import { filterRestaurants, pickByWeight, recommendLunch, sortRestaurants } from "./recommend.js";
import { RESTAURANTS } from "./restaurants.js";

const today = "2026-09-24";

describe("filterRestaurants", () => {
    it("도보 시간 조건을 넘는 식당은 제외한다", () => {
        const result = filterRestaurants(RESTAURANTS, { today, maxWalkMinutes: 3 });
        expect(result.map((r) => r.id)).toEqual(["r02", "r08", "r10", "r12"]);
    });

    it("최근 3일 안에 방문한 식당은 제외한다", () => {
        const result = filterRestaurants(RESTAURANTS, { today, recentVisits: [{ restaurantId: "r02", date: "2026-09-23" }] });
        expect(result.some((r) => r.id === "r02")).toBe(false);
    });
});

describe("recommendLunch", () => {
    it("서로 다른 후보를 요청한 개수만큼 고른다", () => {
        const result = recommendLunch({ today, count: 3 }, RESTAURANTS, () => 0.5);
        expect(new Set(result.map((r) => r.id)).size).toBe(3);
    });

    it("가중치가 큰 항목이 먼저 뽑힌다", () => {
        expect(pickByWeight(["a", "b"], (item) => (item === "a" ? 9 : 1), () => 0.5)).toBe("a");
    });

    it("정렬을 생략하면 기존 가중 추첨 순서를 유지한다", () => {
        const result = recommendLunch({ today, count: 6 }, RESTAURANTS, () => 0.5);
        expect(result.map((r) => r.id)).toEqual(["r07", "r06", "r08", "r05", "r04", "r09"]);
    });

    it.each([
        ["price", (r: (typeof RESTAURANTS)[number]) => r.price],
        ["walk", (r: (typeof RESTAURANTS)[number]) => r.walkMinutes],
    ] as const)("%s 오름차순으로 후보를 정렬한다", (sort, value) => {
        const options = { today, count: 6, sort };
        const result = recommendLunch(options, RESTAURANTS, () => 0.5);
        expect(result.map(value)).toEqual([...result].map(value).sort((a, b) => a - b));
    });

    it.each([
        ["price", (r: (typeof RESTAURANTS)[number]) => r.price, 10000],
        ["walk", (r: (typeof RESTAURANTS)[number]) => r.walkMinutes, 5],
    ] as const)("%s 동률이면 추첨 순서를 유지하고 후보 집합은 바꾸지 않는다", (sort, value, tiedValue) => {
        const restaurants = [
            { ...RESTAURANTS[0], id: "first", price: 10000, walkMinutes: 5 },
            { ...RESTAURANTS[1], id: "second", price: 10000, walkMinutes: 2 },
            { ...RESTAURANTS[2], id: "last", price: 5000, walkMinutes: 5 },
        ];
        const original = recommendLunch({ today, count: 3 }, restaurants, () => 0);
        const options = { today, count: 3, sort };
        const sorted = recommendLunch(options, restaurants, () => 0);
        expect(sorted.filter((r) => value(r) === tiedValue).map((r) => r.id))
            .toEqual(original.filter((r) => value(r) === tiedValue).map((r) => r.id));
        expect(new Set(sorted.map((r) => r.id))).toEqual(new Set(original.map((r) => r.id)));
    });

    it("정렬 함수는 입력 배열을 변경하지 않는다", () => {
        const restaurants = [...RESTAURANTS];
        const originalIds = restaurants.map((r) => r.id);
        const sorted = sortRestaurants(restaurants, "price");
        expect(restaurants.map((r) => r.id)).toEqual(originalIds);
        expect(sorted.map((r) => r.price)).toEqual([...restaurants].map((r) => r.price).sort((a, b) => a - b));
    });
});
