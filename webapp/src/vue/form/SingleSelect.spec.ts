import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h, reactive, ref } from "vue";
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
  it("emits update:data so callers can react to the pick", async () => {
    const data = makeData();
    const wrapper = mount(SingleSelect, { props: { data }, ...mountOptions });

    await pickPublic(wrapper);

    const emitted = wrapper.emitted("update:data");
    expect(emitted).toBeTruthy();
    expect(emitted![0][0]).toMatchObject({ selectedValue: { id: "public" } });
  });

  it("carries the option list through unchanged", async () => {
    const data = makeData();
    const wrapper = mount(SingleSelect, { props: { data }, ...mountOptions });

    await pickPublic(wrapper);

    expect(wrapper.emitted("update:data")![0][0]).toMatchObject({
      data: data.data,
    });
  });

  it("leaves the bound object alone — the caller owns its state", async () => {
    const data = makeData();
    const wrapper = mount(SingleSelect, { props: { data }, ...mountOptions });

    await pickPublic(wrapper);

    expect(data.selectedValue?.id).toBe("all");
  });

  // The settings form binds with v-model:data and reads selectedValue back when the
  // user saves, so that binding has to keep working end to end.
  it("updates a v-model:data binding", async () => {
    const Host = defineComponent({
      setup() {
        const model = ref<SingleSelectInterface>(makeData());
        return { model };
      },
      render() {
        // Exactly what v-model:data compiles to.
        return h(SingleSelect, {
          data: this.model,
          "onUpdate:data": (value: SingleSelectInterface) => {
            this.model = value;
          },
        });
      },
    });

    const wrapper = mount(Host, mountOptions);
    await pickPublic(wrapper);

    expect(wrapper.vm.model.selectedValue?.id).toBe("public");
    expect(wrapper.find(".input-wrapper").text()).toBe("Public");
  });
});
