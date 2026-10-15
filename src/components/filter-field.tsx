import { FunnelSimpleIcon } from "@phosphor-icons/react";
import type { ComponentProps } from "react";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

export function FilterField({ className, ...props }: ComponentProps<typeof InputGroupInput>) {
  return (
    <InputGroup className={cn("bg-raised", className)}>
      <InputGroupInput {...props} />
      <InputGroupAddon>
        <FunnelSimpleIcon aria-hidden="true" />
      </InputGroupAddon>
      <InputGroupAddon align="inline-end">
        <Kbd aria-hidden="true">/</Kbd>
      </InputGroupAddon>
    </InputGroup>
  );
}
