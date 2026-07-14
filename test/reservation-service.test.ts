/**
 * T6 — Reservation repository interface + InMemory impl + Application Service
 *      (REQ-05 + REQ-06).
 *
 * Verifies:
 *   - ReservationRepository interface + InMemoryReservationRepository (pure
 *     in-memory, NO SQL/eval/DB driver — INV-4 security red line #1)
 *   - ReservationService orchestrates load → aggregate call → save → return
 *     events, with NO business rules of its own
 *
 * category: unit
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ReservationRepository } from "../src/domain/reservations/service";
import {
  InMemoryReservationRepository,
  ReservationService,
} from "../src/domain/reservations/service";

// INV-4 / security red line #1: assert the impl file has no DB/eval surface.
const IMPL_SRC = readFileSync(
  new URL("../src/domain/reservations/service.ts", import.meta.url),
  "utf-8",
);

function makeService(): { service: ReservationService; repo: ReservationRepository } {
  const repo = new InMemoryReservationRepository();
  return { service: new ReservationService(repo), repo };
}

describe("T6: Reservation repository + Application Service (REQ-05/06)", () => {
  describe("security red line #1 — pure in-memory, no DB/eval surface", () => {
    it("service.ts has no SQL/eval/new Function/DB driver", () => {
      expect(IMPL_SRC).not.toMatch(/\beval\s*\(/);
      expect(IMPL_SRC).not.toMatch(/new Function/);
      expect(IMPL_SRC).not.toMatch(/\b(SELECT|INSERT|UPDATE|DELETE)\b/i);
      expect(IMPL_SRC).not.toMatch(
        /require\(['"]pg['"]\)|require\(['"]mysql['"]\)|from ['"]pg['"]|from ['"]mysql['"]/,
      );
    });

    it("repository impl has a @non-production TODO marker", () => {
      expect(IMPL_SRC).toMatch(/@non-production|NOT FOR PRODUCTION/);
    });
  });

  describe("InMemoryReservationRepository", () => {
    it("findById returns null when absent", async () => {
      const { repo } = makeService();
      expect(await repo.findById("missing")).toBeNull();
    });

    it("save then findById round-trips", async () => {
      const { service, repo } = makeService();
      const { reservationId } = await service.bookReservation({
        id: "res-x",
        guestRef: "g1",
        checkInDate: new Date("2026-07-01"),
        checkOutDate: new Date("2026-07-03"),
      });
      const loaded = await repo.findById(reservationId);
      expect(loaded).not.toBeNull();
      expect(loaded?.state).toBe("Booked");
    });
  });

  describe("ReservationService orchestration (no business rules of its own)", () => {
    it("bookReservation creates a Booked reservation + returns empty events", async () => {
      const { service } = makeService();
      const result = await service.bookReservation({
        id: "res-1",
        guestRef: "g1",
        checkInDate: new Date("2026-07-01"),
        checkOutDate: new Date("2026-07-03"),
      });
      expect(result.reservationId).toBe("res-1");
      expect(result.events).toEqual([]);
    });

    it("confirmReservation loads → confirms → saves → returns ReservationConfirmed event", async () => {
      const { service } = makeService();
      await service.bookReservation({
        id: "res-1",
        guestRef: "g1",
        checkInDate: new Date("2026-07-01"),
        checkOutDate: new Date("2026-07-03"),
      });
      const result = await service.confirmReservation("res-1", { paymentCaptured: true });
      expect(result.events.some((e) => e.type === "ReservationConfirmed")).toBe(true);
      // State persisted.
      expect((await service.repo.findById("res-1"))?.state).toBe("Confirmed");
    });

    it("findConfirmed queries confirmed reservations", async () => {
      const { service } = makeService();
      await service.bookReservation({
        id: "res-1",
        guestRef: "g1",
        checkInDate: new Date("2026-07-01"),
        checkOutDate: new Date("2026-07-03"),
      });
      await service.bookReservation({
        id: "res-2",
        guestRef: "g2",
        checkInDate: new Date("2026-07-01"),
        checkOutDate: new Date("2026-07-03"),
      });
      await service.confirmReservation("res-1", { paymentCaptured: true });
      const confirmed = await service.repo.findConfirmed();
      expect(confirmed.map((r) => r.id)).toEqual(["res-1"]);
    });
  });
});
