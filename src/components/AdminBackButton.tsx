import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Home } from "lucide-react";
import { cn } from "@/lib/utils";

interface AdminBackButtonProps {
  to?: string;
  label?: string;
  className?: string;
  showHome?: boolean;
}

export function AdminBackButton({ 
  to, 
  label = "Back", 
  className,
  showHome = false 
}: AdminBackButtonProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (to) {
      navigate(to);
    } else {
      navigate(-1);
    }
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleBack}
        className="gap-1.5 text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {label}
      </Button>
      
      {showHome && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/admin/hub")}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          title="Go to Hub"
        >
          <Home className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

export default AdminBackButton;
