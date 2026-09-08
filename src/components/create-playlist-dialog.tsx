import { PlusIcon } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { SidebarGroupAction } from "@/components/ui/sidebar";
import { useCreatePlaylistMutation } from "@/lib/library-query";

type CreateForm = {
  description: string;
  title: string;
};

export function CreatePlaylistDialog() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const createPlaylist = useCreatePlaylistMutation();

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && createPlaylist.isPending) return;
    if (!nextOpen) {
      formRef.current?.reset();
      setErrorMessage(null);
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
      setErrorMessage("Enter a playlist title");
      return;
    }

    setErrorMessage(null);

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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <SidebarGroupAction
            aria-label="Create playlist"
            className={buttonVariants({
              className: "top-1.5 right-2",
              size: "icon",
              variant: "ghost",
            })}
          />
        }
      >
        <PlusIcon aria-hidden="true" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Create playlist</DialogTitle>
          <DialogDescription>Start with a name. You can add tracks next.</DialogDescription>
        </DialogHeader>
        <form id="create-playlist" onSubmit={handleSubmit} ref={formRef}>
          <FieldGroup>
            <Field>
              <Label htmlFor="title">Title</Label>
              <Input
                autoFocus
                id="title"
                maxLength={100}
                name="title"
                placeholder="Playlist title"
                required
              />
            </Field>
            <Field>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                maxLength={300}
                name="description"
                placeholder="Optional"
              />
            </Field>
          </FieldGroup>
        </form>
        <FieldError>{errorMessage ?? createPlaylist.error?.message}</FieldError>
        <DialogFooter className="flex flex-col">
          <DialogClose
            disabled={createPlaylist.isPending}
            render={<Button variant="outline">Cancel</Button>}
          />
          <Button disabled={createPlaylist.isPending} form="create-playlist" type="submit">
            {createPlaylist.isPending ? "Creating..." : "Create playlist"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
