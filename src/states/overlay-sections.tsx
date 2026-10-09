import {
  ListPlusIcon,
  MinusCircleIcon,
  PlaylistIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { type ReactNode, useEffect, useState } from "react";
import type { MusicLibrary } from "../../shared/lib";
import { AddToPlaylistDialog } from "@/components/add-to-playlist-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createToastManager, ToastList, ToastProvider, ToastViewport } from "@/components/ui/toast";
import { MusicLibraryContext } from "@/hooks/use-music-library";
import { PlaybackContext } from "@/hooks/use-playback";
import { componentStateTracks, toTrack } from "@/states/fixtures";
import type { PartSpec } from "@/states/measure";
import { paper } from "@/states/paper-values";
import { idlePlayback } from "@/states/playback-fixture";
import { Section, Specimen } from "@/states/specimen";

// Paper's literal values for frames 15, 15b and 16 (read with get_jsx on October 8, 2026).
const overlayPaper = {
  inset: "#141414",
  inverseKbd: "#0A0A0A14",
  dangerKbd: "#0A0A0A1F",
  dangerKbdText: "#0A0A0AD9",
  dangerSubtle: "#FF646724",
} as const;

/**
 * A box that popups portal into. Its transform makes it the containing block for the fixed
 * dialogs, so each specimen renders in place instead of over the page.
 */
function PopupStage({
  children,
  className,
}: {
  children: (container: HTMLElement) => ReactNode;
  className: string;
}) {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  return (
    <div className={`relative transform-[translateZ(0)] ${className}`} ref={setContainer}>
      {container && children(container)}
    </div>
  );
}

function MenuStage({ children, height }: { children: ReactNode; height: number }) {
  return (
    <PopupStage className="w-64 pl-2" key={height}>
      {(container) => (
        <div style={{ height }}>
          <DropdownMenu modal={false} open>
            <DropdownMenuTrigger
              aria-hidden="true"
              className="absolute top-0 left-2 size-0"
              tabIndex={-1}
            />
            <DropdownMenuContent container={container} sideOffset={0}>
              {children}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </PopupStage>
  );
}

const menuSelectors = {
  popup: "[data-slot=dropdown-menu-content]",
  item: (index: number) => `[data-slot=dropdown-menu-item]:nth-child(${index})`,
} as const;

function menuItemParts(
  name: string,
  selector: string,
  { danger = false, highlighted = false } = {},
): PartSpec[] {
  return [
    {
      name,
      paper: {
        backgroundColor: highlighted
          ? danger
            ? overlayPaper.dangerSubtle
            : paper.neutral800
          : paper.transparent,
        borderRadius: 4,
        color: danger ? paper.red300 : paper.neutral100,
        fontSize: 13,
        height: 32,
        lineHeight: 16,
        paddingLeft: 8,
      },
      selector,
    },
    ...(danger
      ? []
      : [
          {
            name: `${name} icon`,
            paper: {
              color: highlighted ? paper.neutral100 : paper.neutral400,
              height: 16,
              width: 16,
            },
            selector: `${selector} svg`,
          },
        ]),
  ];
}

const menuPopupPart: PartSpec = {
  name: "menu",
  paper: {
    backgroundColor: paper.neutral900,
    borderRadius: 8,
    edge: `1px ${paper.neutral800}`,
    paddingLeft: 4,
    width: 240,
  },
  selector: menuSelectors.popup,
};

export function MenuSection() {
  return (
    <Section
      description="Frame 16. DropdownMenu at rest after the 150ms open. The first item is highlighted as if hovered. Items the app doesn't have yet (Play next, Like, Play now) are left out."
      title="Menus"
    >
      <Specimen
        id="menu.track"
        label="Track menu"
        parts={[
          menuPopupPart,
          ...menuItemParts("highlighted item", `${menuSelectors.popup} > :nth-child(1)`, {
            highlighted: true,
          }),
          ...menuItemParts("item", `${menuSelectors.popup} > :nth-child(3)`),
          {
            name: "separator",
            paper: { backgroundColor: paper.neutral800, height: 1 },
            selector: "[data-slot=dropdown-menu-separator]",
          },
          {
            name: "shortcut",
            paper: { color: paper.neutral400, fontFamily: "mono", fontSize: 12, lineHeight: 16 },
            selector: "[data-slot=dropdown-menu-shortcut]",
          },
        ]}
      >
        <MenuStage height={176}>
          <DropdownMenuItem data-highlighted="">
            <ListPlusIcon aria-hidden="true" />
            Add to queue
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <PlaylistIcon aria-hidden="true" />
            Add to playlist…
            <DropdownMenuShortcut>P</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <PlusIcon aria-hidden="true" />
            New playlist from track
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="danger">
            <MinusCircleIcon aria-hidden="true" />
            <span className="truncate">Remove from Night Drive</span>
          </DropdownMenuItem>
        </MenuStage>
      </Specimen>
      <Specimen
        id="menu.danger-highlighted"
        label="Danger, highlighted"
        parts={[
          ...menuItemParts("item", `${menuSelectors.popup} > :nth-child(1)`, {
            danger: true,
            highlighted: true,
          }),
          {
            name: "shortcut",
            paper: { color: paper.red300, fontFamily: "mono", fontSize: 12 },
            selector: "[data-slot=dropdown-menu-shortcut]",
          },
        ]}
      >
        <MenuStage height={48}>
          <DropdownMenuItem data-highlighted="" variant="danger">
            <MinusCircleIcon aria-hidden="true" />
            <span className="truncate">Remove from Night Drive</span>
            <DropdownMenuShortcut>⌫</DropdownMenuShortcut>
          </DropdownMenuItem>
        </MenuStage>
      </Specimen>
      <Specimen
        id="menu.playlist"
        label="Playlist menu"
        parts={[
          menuPopupPart,
          ...menuItemParts("item", `${menuSelectors.popup} > :nth-child(1)`, { danger: true }),
        ]}
      >
        <MenuStage height={48}>
          <DropdownMenuItem variant="danger">
            <TrashIcon aria-hidden="true" />
            Delete playlist…
          </DropdownMenuItem>
        </MenuStage>
      </Specimen>
    </Section>
  );
}

const dialogParts: PartSpec[] = [
  {
    name: "dialog",
    paper: {
      backgroundColor: paper.neutral900,
      borderRadius: 12,
      edge: `1px ${paper.neutral800}`,
      width: 400,
    },
    selector: "[data-slot=dialog-content]",
  },
  {
    name: "title",
    paper: {
      color: paper.neutral100,
      fontSize: 15,
      fontWeight: 600,
      letterSpacing: -0.15,
      lineHeight: 20,
    },
    selector: "[data-slot=dialog-title]",
  },
  {
    name: "footer",
    paper: {
      backgroundColor: overlayPaper.inset,
      edge: `1px ${paper.neutral800} (border)`,
      height: 65,
      paddingLeft: 24,
    },
    selector: "[data-slot=dialog-footer]",
  },
];

function DialogStage({ children, height }: { children: ReactNode; height: number }) {
  return (
    <PopupStage className="w-112" key={height}>
      {(container) => (
        <div style={{ height }}>
          <Dialog disablePointerDismissal modal={false} open>
            <DialogContent container={container} initialFocus={false}>
              {children}
            </DialogContent>
          </Dialog>
        </div>
      )}
    </PopupStage>
  );
}

function CreateDialogSpecimen({ invalid = false }: { invalid?: boolean }) {
  return (
    <DialogStage height={invalid ? 360 : 336}>
      <DialogBody>
        <DialogTitle>New playlist</DialogTitle>
        <FieldGroup>
          <Field>
            <Label htmlFor={invalid ? "states-title-invalid" : "states-title"}>Title</Label>
            <Input
              aria-describedby={invalid ? "states-title-error" : undefined}
              aria-invalid={invalid || undefined}
              defaultValue={invalid ? "" : "Rainy Sunday"}
              id={invalid ? "states-title-invalid" : "states-title"}
            />
            {invalid && (
              <p className="text-meta text-danger" id="states-title-error">
                Give the playlist a title.
              </p>
            )}
          </Field>
          <Field>
            <Label htmlFor={invalid ? "states-description-invalid" : "states-description"}>
              Description <span className="font-normal">Optional</span>
            </Label>
            <Textarea
              id={invalid ? "states-description-invalid" : "states-description"}
              placeholder="What’s it for?"
            />
          </Field>
        </FieldGroup>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost">Cancel</Button>
        <Button variant="primary">
          Create
          <Kbd aria-hidden="true" variant="inverse">
            ↵
          </Kbd>
        </Button>
      </DialogFooter>
    </DialogStage>
  );
}

export function DialogSection() {
  return (
    <Section
      description="Frame 15. Dialog primitives as the create and delete dialogs compose them, non-modal so they can sit side by side. The delete dialog uses AlertDialog in the app, which shares these classes."
      title="Dialogs"
    >
      <Specimen
        force={{ selector: "#states-title", states: ["focus-visible"] }}
        id="dialog.create"
        label="Create playlist"
        parts={[
          ...dialogParts,
          {
            name: "body",
            paper: { paddingLeft: 24 },
            selector: "[data-slot=dialog-body]",
          },
          {
            name: "cancel",
            paper: { color: paper.neutral400, height: 32 },
            selector: "[data-slot=dialog-footer] button:first-child",
          },
          {
            name: "create",
            paper: { backgroundColor: paper.neutral100, height: 32, paddingRight: 8 },
            selector: "[data-slot=dialog-footer] button:last-child",
          },
          {
            name: "create shortcut",
            paper: {
              backgroundColor: overlayPaper.inverseKbd,
              borderRadius: 4,
              color: paper.neutral600,
              fontFamily: "mono",
              fontSize: 12,
              height: 16,
            },
            selector: "[data-slot=kbd]",
          },
        ]}
      >
        <CreateDialogSpecimen />
      </Specimen>
      <Specimen
        id="dialog.create-invalid"
        label="No title"
        parts={[
          {
            name: "title field",
            paper: { edge: `1px ${paper.red400}` },
            selector: "#states-title-invalid",
          },
          {
            name: "error",
            paper: { color: paper.red300, fontSize: 12, lineHeight: 16 },
            selector: "#states-title-error",
          },
        ]}
      >
        <CreateDialogSpecimen invalid />
      </Specimen>
      <Specimen
        force={{
          selector: "[data-slot=dialog-footer] button:first-child",
          states: ["focus-visible"],
        }}
        id="dialog.delete"
        label="Delete playlist"
        parts={[
          ...dialogParts,
          {
            name: "header",
            paper: { paddingLeft: 24 },
            selector: "[data-slot=dialog-header]",
          },
          {
            name: "description",
            paper: { color: paper.neutral400, fontSize: 13, lineHeight: 20 },
            selector: "[data-slot=dialog-description]",
          },
          {
            name: "cancel",
            paper: {
              backgroundColor: paper.neutral800,
              color: paper.neutral100,
              focusRing: `2px ${paper.neutral500} 2px`,
            },
            selector: "[data-slot=dialog-footer] button:first-child",
          },
          {
            name: "delete",
            paper: { backgroundColor: paper.red400, color: paper.neutral950, paddingRight: 8 },
            selector: "[data-slot=dialog-footer] button:last-child",
          },
          {
            name: "delete shortcut",
            paper: {
              backgroundColor: overlayPaper.dangerKbd,
              color: overlayPaper.dangerKbdText,
              height: 16,
            },
            selector: "[data-slot=kbd]",
          },
        ]}
      >
        <DialogStage height={176}>
          <DialogHeader className="p-6">
            <DialogTitle>Delete Night Drive?</DialogTitle>
            <DialogDescription>Its 48 tracks stay in your library.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button>Cancel</Button>
            <Button variant="danger">
              Delete playlist
              <Kbd aria-hidden="true" variant="danger">
                ⌘⌫
              </Kbd>
            </Button>
          </DialogFooter>
        </DialogStage>
      </Specimen>
    </Section>
  );
}

const paletteLibrary: MusicLibrary = {
  kind: "library",
  playlists: [
    { description: null, id: 1, title: "Night Drive", trackCount: 48 },
    { description: null, id: 2, title: "City Pop", trackCount: 31 },
    { description: null, id: 3, title: "Focus, ambient", trackCount: 64 },
    { description: null, id: 4, title: "Sunday morning", trackCount: 22 },
    { description: null, id: 5, title: "Run 5k", trackCount: 19 },
  ],
  sources: [],
  tracks: [],
};

const paletteTrack = toTrack(componentStateTracks.playing, 1);

const paletteFinalFocus = { current: null };

export function PaletteSection() {
  return (
    <Section
      description="Frame 15b, state A. The real AddToPlaylistDialog over five fixture playlists. Adding does nothing here; the already-added state is checked in the app."
      title="Add to playlist"
    >
      <Specimen
        id="palette.default"
        label="Open"
        parts={[
          {
            name: "palette",
            paper: {
              backgroundColor: paper.neutral900,
              borderRadius: 12,
              edge: `1px ${paper.neutral800}`,
              width: 560,
            },
            selector: "[data-slot=palette]",
          },
          {
            name: "header",
            paper: { height: 48, paddingLeft: 16 },
            selector: "[data-slot=palette] > div:first-of-type",
          },
          {
            name: "track chip",
            paper: {
              backgroundColor: paper.neutral800,
              borderRadius: 6,
              height: 24,
              paddingLeft: 4,
            },
            selector: "[data-slot=palette] > div:first-of-type > span",
          },
          {
            name: "chip title",
            paper: { color: paper.neutral100, fontSize: 12, lineHeight: 16 },
            selector: "[data-slot=palette] > div:first-of-type > span > span:last-child",
          },
          {
            name: "query",
            paper: {
              color: paper.neutral100,
              fontSize: 15,
              fontWeight: 400,
              lineHeight: 20,
              placeholderColor: paper.neutral400,
            },
            selector: "[data-slot=palette] input",
          },
          {
            name: "group label",
            paper: { color: paper.neutral400, fontSize: 12, fontWeight: 500, height: 32 },
            selector: "[role=group] > div:first-child",
          },
          {
            name: "highlighted row",
            paper: {
              backgroundColor: paper.neutral800,
              borderRadius: 4,
              fontSize: 13,
              fontWeight: 500,
              height: 40,
              paddingLeft: 8,
            },
            selector: "[role=option][data-highlighted]",
          },
          {
            name: "highlighted shortcut",
            paper: { color: paper.neutral400, height: 20, width: 20 },
            selector: "[role=option][data-highlighted] [data-slot=kbd]",
          },
          {
            name: "row",
            paper: { backgroundColor: paper.transparent, fontWeight: 400, height: 40 },
            selector: "[role=option]:not([data-highlighted])",
          },
          {
            name: "count",
            paper: { color: paper.neutral400, fontFamily: "mono", fontSize: 12 },
            selector: "[role=option]:not([data-highlighted]) > span:last-child",
          },
          {
            name: "footer",
            paper: {
              backgroundColor: overlayPaper.inset,
              color: paper.neutral400,
              fontFamily: "mono",
              fontSize: 12,
              height: 40,
              paddingLeft: 16,
            },
            selector: "[data-slot=palette] > div:last-of-type",
          },
        ]}
      >
        <PopupStage className="h-[476px] w-[592px]">
          {(container) => (
            <PlaybackContext.Provider value={idlePlayback}>
              <MusicLibraryContext.Provider value={paletteLibrary}>
                <AddToPlaylistDialog
                  container={container}
                  finalFocus={paletteFinalFocus}
                  onCreatePlaylist={() => {}}
                  onOpenChange={() => {}}
                  open
                  track={paletteTrack}
                />
              </MusicLibraryContext.Provider>
            </PlaybackContext.Provider>
          )}
        </PopupStage>
      </Specimen>
    </Section>
  );
}

type ToastSpec = Parameters<ReturnType<typeof createToastManager>["add"]>[0];

function ToastStage({ toast }: { toast: ToastSpec }) {
  const [manager] = useState(createToastManager);

  useEffect(() => {
    const id = manager.add(toast);

    return () => manager.close(id);
  }, [manager, toast]);

  return (
    <ToastProvider toastManager={manager}>
      <div className="relative h-20 w-90">
        <ToastViewport className="absolute right-0 bottom-0 w-full">
          <ToastList />
        </ToastViewport>
      </div>
    </ToastProvider>
  );
}

const confirmationToast: ToastSpec = {
  timeout: 600_000,
  title: "Added to Night Drive",
  type: "success",
};

const errorToast: ToastSpec = {
  description: "Try again.",
  timeout: 0,
  title: "Couldn’t like Plastic Love",
  type: "error",
};

const toastRootPart = (height?: number): PartSpec => ({
  name: "toast",
  paper: {
    backgroundColor: paper.neutral800,
    borderRadius: 12,
    edge: `1px ${paper.neutral700}`,
    height,
  },
  selector: "[data-slot=toast]",
});

export function ToastSection() {
  return (
    <Section
      description="Frame 16, E. The app's ToastList with its own manager. The Undo toast isn't built (Undo is out of scope)."
      title="Toasts"
    >
      <Specimen
        id="toast.confirmation"
        label="Confirmation"
        parts={[
          toastRootPart(40),
          {
            name: "content",
            paper: { paddingLeft: 12, paddingRight: 12 },
            selector: "[data-slot=toast-content]",
          },
          {
            name: "icon",
            paper: { color: paper.neutral400, height: 16, width: 16 },
            selector: "[data-slot=toast-content] > svg",
          },
          {
            name: "title",
            paper: { color: paper.neutral100, fontSize: 13, fontWeight: 400, lineHeight: 16 },
            selector: "[data-slot=toast-title]",
          },
        ]}
      >
        <ToastStage toast={confirmationToast} />
      </Specimen>
      <Specimen
        id="toast.error"
        label="Error"
        parts={[
          toastRootPart(),
          {
            name: "content",
            paper: { paddingLeft: 12, paddingRight: 4 },
            selector: "[data-slot=toast-content]",
          },
          {
            name: "dot",
            paper: { backgroundColor: paper.red400, height: 6, width: 6 },
            selector: "[data-slot=toast-content] > span",
          },
          {
            name: "title",
            paper: { color: paper.neutral100, fontSize: 13, fontWeight: 500, lineHeight: 16 },
            selector: "[data-slot=toast-title]",
          },
          {
            name: "description",
            paper: { color: paper.neutral400, fontSize: 12, lineHeight: 16 },
            selector: "[data-slot=toast-description]",
          },
          {
            name: "close",
            paper: { borderRadius: 6, color: paper.neutral400, height: 24, width: 24 },
            selector: "[data-slot=toast-close]",
          },
        ]}
      >
        <ToastStage toast={errorToast} />
      </Specimen>
    </Section>
  );
}
