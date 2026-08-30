import { FolderPlus, Plus } from "lucide-react";
import { CreateProjectDialog } from "@/components/create-project-dialog";
import { Button } from "@/components/ui/button";

type EmptyProjectsProps = {
  onCreate: (name: string) => Promise<void>;
};

export function EmptyProjects({ onCreate }: EmptyProjectsProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-24 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-muted">
        <FolderPlus className="size-6 text-muted-foreground" />
      </div>
      <h2 className="mt-5 font-medium text-lg">还没有项目</h2>
      <p className="mt-2 max-w-sm text-muted-foreground text-sm">
        创建第一个项目，开始用节点画布串联模型，生产影视资产。
      </p>
      <CreateProjectDialog
        onCreate={onCreate}
        trigger={
          <Button className="mt-6">
            <Plus />
            新建项目
          </Button>
        }
      />
    </div>
  );
}
