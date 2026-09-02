import { PlusIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { PlaylistCreationInput } from "../../shared/lib";
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
import { libraryQuery } from "@/lib/library-query";

type CreateForm = {
  description: string;
  title: string;
};

export function CreatePlaylistDialog() {
  const [open, setOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const createPlaylist = useMutation({
    mutationFn: window.lume.createPlaylist,
    networkMode: "always",
    scope: { id: "library" },
    onSuccess: (library) => queryClient.setQueryData(libraryQuery.queryKey, library),
  });

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && createPlaylist.isPending) return;
    if (!nextOpen) {
      setErrorMessage(null);
      createPlaylist.reset();
    }
    setOpen(nextOpen);
  };

  const handleSubmit = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = Object.fromEntries(new FormData(form));

    // SAFETY: `title` and `description` are named text controls in this form.
    const values = formData as CreateForm;

    const title = values.title.trim();
    const description = values.description.trim();

    if (title.length === 0) {
      setErrorMessage("Enter a playlist title");
      return;
    }

    const input = {
      description: description.length > 0 ? description : null,
      title,
    } satisfies PlaylistCreationInput;

    setErrorMessage(null);

    try {
      await createPlaylist.mutateAsync(input);
      form.reset();
      setOpen(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not create the playlist");
    }
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
          <DialogDescription>
            Create a playlist here. Click save when you are done.
          </DialogDescription>
        </DialogHeader>
        <form id="create-playlist" onSubmit={(event) => void handleSubmit(event)}>
          <FieldGroup>
            <Field>
              <Label htmlFor="title">Title</Label>
              <Input
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
        <FieldError>{errorMessage}</FieldError>
        <DialogFooter className="flex flex-col">
          <DialogClose
            disabled={createPlaylist.isPending}
            render={<Button variant="outline">Cancel</Button>}
          />
          <Button disabled={createPlaylist.isPending} form="create-playlist" type="submit">
            {createPlaylist.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
