"use client";

import { createContext } from "react";

export type PageExportAction = () => void | Promise<void>;
export const PageExportContext = createContext<((action: PageExportAction | null) => void) | null>(null);
