import { PlusIcon } from "@phosphor-icons/react";
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
import { useLibraryMutation } from "@/lib/library-query";

type CreateForm = {
  description: string;
  title: string;
};

export function CreatePlaylistDialog() {
  const [open, setOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const libraryMutation = useLibraryMutation();

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && libraryMutation.isPending) return;
    if (!nextOpen) {
      setErrorMessage(null);
      libraryMutation.reset();
    }
    setOpen(nextOpen);
  };

  const handleSubmit = (event: React.SubmitEvent<HTMLFormElement>) => {
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

    libraryMutation.mutate(
      { input, kind: "create-playlist" },
      {
        onSuccess: () => {
          form.reset();
          setOpen(false);
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
          <DialogDescription>
            Create a playlist here. Click save when you are done.
          </DialogDescription>
        </DialogHeader>
        <form id="create-playlist" onSubmit={handleSubmit}>
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
        <FieldError>{errorMessage ?? libraryMutation.error?.message}</FieldError>
        <DialogFooter className="flex flex-col">
          <DialogClose
            disabled={libraryMutation.isPending}
            render={<Button variant="outline">Cancel</Button>}
          />
          <Button disabled={libraryMutation.isPending} form="create-playlist" type="submit">
            {libraryMutation.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
