"use client";

import { useState } from "react";
import { ClipboardList, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BulkImportForm } from "@/components/receive/bulk-import-form";
import { ReceiveIntakeForm } from "@/components/receive/receive-intake-form";
import { cn } from "@/lib/utils";

type ReceiveMode = "manual" | "import";

export function ReceiveWorkspace() {
  const [mode, setMode] = useState<ReceiveMode>("manual");

  return (
    <>
      <div className="mb-6 flex flex-wrap gap-2">
        <Button
          type="button"
          variant={mode === "manual" ? "default" : "outline"}
          className={cn("gap-2", mode === "manual" && "shadow-sm")}
          onClick={() => setMode("manual")}
        >
          <ClipboardList className="size-4" aria-hidden />
          Manual receive
        </Button>
        <Button
          type="button"
          variant={mode === "import" ? "default" : "outline"}
          className={cn("gap-2", mode === "import" && "shadow-sm")}
          onClick={() => setMode("import")}
        >
          <FileSpreadsheet className="size-4" aria-hidden />
          Import delivery list
        </Button>
      </div>

      {mode === "manual" ? <ReceiveIntakeForm /> : <BulkImportForm />}
    </>
  );
}
