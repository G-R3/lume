import { PlusIcon } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { type KeyboardEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useCreatePlaylistMutation } from "@/lib/library-query";

type CreateForm = {
  description: string;
  title: string;
};

export function CreatePlaylistDialog() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const createPlaylist = useCreatePlaylistMutation();

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && createPlaylist.isPending) return;

    if (!nextOpen) {
      formRef.current?.reset();
      setTitleError(null);
      createPlaylist.reset();
    }

    setOpen(nextOpen);
  };

  const handleSubmit = (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;

    // SAFETY: `title` and `description` are named text controls in this form.
    const values = Object.fromEntries(new FormData(form)) as CreateForm;

    const title = values.title.trim();
    const description = values.description.trim();

    if (title.length === 0) {
      setTitleError("Give the playlist a title.");
      titleRef.current?.focus();

      return;
    }

    setTitleError(null);

    createPlaylist.mutate(
      { description: description.length > 0 ? description : null, title },
      {
        onSuccess: (result) => {
          form.reset();
          setOpen(false);
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
      <DialogTrigger
        render={<Button aria-label="Create playlist" size="icon-sm" variant="ghost" />}
      >
        <PlusIcon aria-hidden="true" />
      </DialogTrigger>
      <DialogContent>
        <DialogBody>
          <DialogTitle>New playlist</DialogTitle>
          <form id="create-playlist" noValidate onSubmit={handleSubmit} ref={formRef}>
            <FieldGroup>
              <Field>
                <Label htmlFor="title">Title</Label>
                <Input
                  aria-describedby={titleError ? "title-error" : undefined}
                  aria-invalid={titleError ? true : undefined}
                  autoFocus
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
              ↵
            </Kbd>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
