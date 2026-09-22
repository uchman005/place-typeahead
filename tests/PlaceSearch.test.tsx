import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlaceSearch } from "@/components/PlaceSearch";
import { place } from "./helpers";

const RESULTS = [place("Lekki", { lga: "Eti Osa" }), place("Lekki Phase 1"), place("Lekki Free Zone")];

function renderSearch(fetcher = vi.fn().mockResolvedValue(RESULTS), onSelect = vi.fn()) {
  const user = userEvent.setup();
  render(<PlaceSearch fetcher={fetcher} onSelect={onSelect} debounceMs={10} />);
  const input = screen.getByRole("combobox");
  return { user, input, fetcher, onSelect };
}

describe("PlaceSearch", () => {
  it("exposes an accessible combobox that opens a listbox of results", async () => {
    const { user, input } = renderSearch();
    expect(input).toHaveAttribute("aria-expanded", "false");

    await user.type(input, "lek");
    const options = await screen.findAllByRole("option");
    expect(options).toHaveLength(3);
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("listbox")).toHaveAttribute("id", input.getAttribute("aria-controls"));
  });

  it("moves through options with the arrow keys, wrapping at both ends", async () => {
    const { user, input } = renderSearch();
    await user.type(input, "lek");
    const options = await screen.findAllByRole("option");

    await user.keyboard("{ArrowDown}");
    expect(input).toHaveAttribute("aria-activedescendant", options[0].id);
    expect(options[0]).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowUp}");
    expect(input).toHaveAttribute("aria-activedescendant", options[2].id);

    await user.keyboard("{ArrowDown}");
    expect(input).toHaveAttribute("aria-activedescendant", options[0].id);
  });

  it("selects the active option with Enter, fills the input and closes the list", async () => {
    const { user, input, onSelect } = renderSearch();
    await user.type(input, "lek");
    await screen.findAllByRole("option");

    await user.keyboard("{ArrowDown}{Enter}");
    expect(onSelect).toHaveBeenCalledWith(RESULTS[0]);
    expect(input).toHaveValue("Lekki, Eti Osa, Lagos");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Selected place" })).toHaveTextContent("Lekki");
  });

  it("does not select anything on Enter when no option is active", async () => {
    const { user, input, onSelect } = renderSearch();
    await user.type(input, "lek");
    await screen.findAllByRole("option");
    await user.keyboard("{Enter}");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("closes on the first Escape and clears on the second", async () => {
    const { user, input } = renderSearch();
    await user.type(input, "lek");
    await screen.findAllByRole("option");

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).toHaveValue("lek");

    await user.keyboard("{Escape}");
    expect(input).toHaveValue("");
  });

  it("selects with the mouse", async () => {
    const { user, input, onSelect } = renderSearch();
    await user.type(input, "lek");
    const options = await screen.findAllByRole("option");
    await user.click(options[1]);
    expect(onSelect).toHaveBeenCalledWith(RESULTS[1]);
  });

  it("shows an empty state that names the query", async () => {
    const { user, input } = renderSearch(vi.fn().mockResolvedValue([]));
    await user.type(input, "qqqq");
    expect(await screen.findByText(/No places in Nigeria match “qqqq”/)).toBeInTheDocument();
  });

  it("shows an error with a working retry", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error("Place search is unavailable right now."))
      .mockResolvedValue(RESULTS);
    const { user, input } = renderSearch(fetcher);

    await user.type(input, "lek");
    expect(await screen.findByRole("alert")).toHaveTextContent(/unavailable/);

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findAllByRole("option")).toHaveLength(3);
  });

  it("announces result counts to screen readers", async () => {
    const { user, input } = renderSearch();
    await user.type(input, "lek");
    await waitFor(() =>
      expect(document.getElementById(input.getAttribute("aria-describedby")!)).toHaveTextContent("3 places found"),
    );
  });
});
