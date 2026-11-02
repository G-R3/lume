import { ArrowElbowDownLeftIcon } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { type ComponentProps, type KeyboardEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useCreatePlaylistMutation } from "@/lib/playlist-mutations";
import type { ActionTarget } from "@/pages/tracks/track-selection";

export type PlaylistCreationRequest = {
  finalFocus?: ComponentProps<typeof DialogContent>["finalFocus"];
  target: ActionTarget | null;
};

export function CreatePlaylistDialog({
  onOpenChange,
  open,
  request,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  request: PlaylistCreationRequest;
}) {
  const { finalFocus, target } = request;
  const entries = target?.entries ?? [];
  const isGroup = entries.length > 1;
  const navigate = useNavigate();
  const [titleError, setTitleError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const createPlaylist = useCreatePlaylistMutation();

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && createPlaylist.isPending) return;

    if (!nextOpen) {
      formRef.current?.reset();
      setTitleError(null);
      createPlaylist.reset();
    }

    onOpenChange(nextOpen);
  };

  const handleSubmit = (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;

    const title = titleRef.current?.value.trim() ?? "";
    const description = descriptionRef.current?.value.trim() ?? "";

    if (title.length === 0) {
      setTitleError("Give the playlist a title.");
      titleRef.current?.focus();

      return;
    }

    setTitleError(null);

    createPlaylist.mutate(
      {
        description: description.length > 0 ? description : null,
        title,
        trackIds: entries.map((entry) => entry.trackId),
      },
      {
        onSuccess: (result) => {
          form.reset();
          onOpenChange(false);
          void navigate({
            params: { playlistId: result.playlist.id },
            to: "/playlists/$playlistId",
          });
        },
      },
    );
  };

  const handleDescriptionKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      formRef.current?.requestSubmit();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        finalFocus={finalFocus}
        initialFocus={() => {
          titleRef.current?.focus();
          titleRef.current?.select();

          return false;
        }}
      >
        <DialogBody>
          <DialogTitle>
            {isGroup
              ? `New playlist from ${entries.length.toLocaleString()} tracks`
              : "New playlist"}
          </DialogTitle>
          <form id="create-playlist" noValidate onSubmit={handleSubmit} ref={formRef}>
            <FieldGroup>
              <Field>
                <Label htmlFor="title">Title</Label>
                <Input
                  aria-describedby={titleError ? "title-error" : undefined}
                  aria-invalid={titleError ? true : undefined}
                  defaultValue={entries.length === 1 ? entries[0].title.trim().slice(0, 100) : ""}
                  id="title"
                  maxLength={100}
                  name="title"
                  onChange={() => setTitleError(null)}
                  ref={titleRef}
                  required
                />
                {titleError && (
                  <p className="text-meta text-danger" id="title-error">
                    {titleError}
                  </p>
                )}
              </Field>
              <Field>
                <Label htmlFor="description">
                  Description <span className="font-normal">Optional</span>
                </Label>
                <Textarea
                  id="description"
                  maxLength={300}
                  name="description"
                  ref={descriptionRef}
                  onKeyDown={handleDescriptionKeyDown}
                  placeholder="What’s it for?"
                />
              </Field>
            </FieldGroup>
          </form>
          <FieldError>{createPlaylist.error?.message}</FieldError>
        </DialogBody>
        <DialogFooter>
          <DialogClose
            disabled={createPlaylist.isPending}
            render={<Button variant="ghost">Cancel</Button>}
          />
          <Button
            busy={createPlaylist.isPending}
            form="create-playlist"
            type="submit"
            variant="primary"
          >
            Create
            <Kbd aria-hidden="true" variant="inverse">
              <ArrowElbowDownLeftIcon className="size-3" weight="bold" />
            </Kbd>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
