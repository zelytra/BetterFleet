import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { reactive } from "vue";
import SingleSelect from "@/vue/form/SingleSelect.vue";
import { SingleSelectInterface } from "@/vue/form/Inputs.ts";

// The app registers "click-outside" globally in main.ts; tests mount the
// component in isolation, so a no-op stub stands in for it.
const mountOptions = {
  global: { directives: { "click-outside": {} } },
};

function makeData(): SingleSelectInterface {
  return reactive<SingleSelectInterface>({
    data: [
      { id: "all", display: "All", image: "" },
      { id: "public", display: "Public", image: "" },
    ],
    selectedValue: { id: "all", display: "All", image: "" },
  });
}

async function pickPublic(wrapper: any): Promise<void> {
  await wrapper.find(".input-wrapper").trigger("click");
  const options = wrapper.findAll(".dropdown span");
  await options[0].trigger("click"); // the dropdown hides the current selection
}

describe("SingleSelect", () => {
  it("moves the selection to the picked option", async () => {
    const data = makeData();
    const wrapper = mount(SingleSelect, { props: { data }, ...mountOptions });

    await pickPublic(wrapper);

    expect(data.selectedValue?.id).toBe("public");
  });

  it("emits update:data so callers can react to the pick", async () => {
    const data = makeData();
    const wrapper = mount(SingleSelect, { props: { data }, ...mountOptions });

    await pickPublic(wrapper);

    const emitted = wrapper.emitted("update:data");
    expect(emitted).toBeTruthy();
    expect(emitted![0][0]).toMatchObject({ selectedValue: { id: "public" } });
  });
});
