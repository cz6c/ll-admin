import { CategoryItem } from "@/api/product/category/index.d";
import { getCategoryTreesApi } from "@/api/product/category";

export function useCategory() {
  const options = ref<CategoryItem[]>([]);

  async function getCategoryTrees() {
    const { data } = await getCategoryTreesApi();
    options.value = data;
  }
  return {
    options,
    getCategoryTrees,
  };
}
