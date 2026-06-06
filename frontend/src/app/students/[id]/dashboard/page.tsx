"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function LegacyStudentDashboardRedirect() {
    const params = useParams();
    const router = useRouter();
    const studentId = params?.id;

    useEffect(() => {
        if (!studentId) return;
        router.replace(`/workspace?studentId=${studentId}&workspace=forms&tab=multi_assessment`);
    }, [router, studentId]);

    return (
        <div className="flex h-full min-h-[320px] items-center justify-center text-sm font-semibold text-slate-500">
            Opening specialist assessment...
        </div>
    );
}
