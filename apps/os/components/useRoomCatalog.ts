"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CatalogCursor } from "../lib/team-catalog";
export function useRoomCatalog<T extends Record<string, { id: string }[]>>(
  room: string,
  path: string,
  empty: T,
  poll = false,
) {
  const [data, setData] = useState<T>(empty),
    [next, setNext] = useState<CatalogCursor | null>(null),
    [notice, setNotice] = useState("Loading…"),
    [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null),
    cursor = useRef<CatalogCursor | null>(null),
    paged = useRef(false);
  const load = useCallback(
    async (append = false) => {
      if (append && !cursor.current) return;
      const c = append ? cursor.current : null;
      if (append) paged.current = true;
      else paged.current = false;
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      setBusy(true);
      try {
        const params = c
          ? `?before=${encodeURIComponent(c.before)}&band=${c.band}`
          : "";
        const response = await fetch(
            `/api/team-space/${room}/${path}${params}`,
            { cache: "no-store", signal: controller.signal },
          ),
          value = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) {
          if ([401, 403, 404].includes(response.status)) {
            setData(empty);
            cursor.current = null;
            setNext(null);
          }
          throw Error(value.error || "Catalog unavailable");
        }
        setData((old) => {
          const result = { ...empty };
          for (const key of Object.keys(empty) as (keyof T)[]) {
            result[key] = [
              ...new Map(
                [...(append ? old[key] : []), ...value[key]].map((row) => [
                  row.id,
                  row,
                ]),
              ).values(),
            ] as T[typeof key];
          }
          return result;
        });
        cursor.current = value.next_cursor ?? null;
        setNext(cursor.current);
        setNotice(
          append
            ? "Earlier page loaded. Refresh to update all current states."
            : "",
        );
      } catch (e) {
        if (!controller.signal.aborted)
          setNotice(e instanceof Error ? e.message : "Unable to load catalog");
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    },
    [room, path, empty],
  );
  useEffect(() => {
    setData(empty);
    cursor.current = null;
    setNext(null);
    void load();
    const timer = poll
      ? setInterval(() => {
          if (!paged.current && document.visibilityState === "visible")
            void load();
        }, 8000)
      : null;
    return () => {
      if (timer) clearInterval(timer);
      request.current?.abort();
    };
  }, [load, poll, empty]);
  return {
    data,
    next,
    notice,
    busy,
    reload: () => void load(),
    more: () => void load(true),
  };
}
