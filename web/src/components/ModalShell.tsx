import { Button } from "@cloudflare/kumo/components/button";
import { Dialog } from "@cloudflare/kumo/components/dialog";
import { X } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useModals } from "../state/modals";

export function ModalShell({
  title,
  children,
  width = "sm:w-2xl"
}: {
  title: string;
  children: ReactNode;
  width?: string;
}) {
  const { close } = useModals();
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Dialog className={width}>
        <div className="h-11 pl-4 pr-2 flex items-center justify-between border-b border-kumo-hairline">
          <Dialog.Title className="text-base font-semibold text-kumo-default">{title}</Dialog.Title>
          <Dialog.Close
            render={(props) => (
              <Button
                {...props}
                variant="ghost"
                size="sm"
                shape="square"
                icon={<X size={14} />}
                aria-label="Close"
              />
            )}
          />
        </div>
        {children}
      </Dialog>
    </Dialog.Root>
  );
}
