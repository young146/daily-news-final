"use client";

import { useState, use } from "react";
import { MOCK_NEWS } from "@/lib/data";
import Link from "next/link";
import { ArrowLeft, Save, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

export default function AdminEditor({ params }) {
    const { id } = use(params);
    const router = useRouter();

    // In a real app, we would fetch data here. For now, find in mock data.
    const newsItem = MOCK_NEWS.find((item) => item.id === id);

    const [formData, setFormData] = useState(newsItem || {
        title: "",
        summary: "",
        content: "",
        category: "Society",
        imageUrl: "",
    });

    if (!newsItem) {
        return <div>News item not found</div>;
    }

    const handlePublish = () => {
        // Call API to publish
        alert("Publishing to Website and SNS...");
        // Simulate API call
        setTimeout(() => {
            alert("Successfully Published!");
            router.push("/admin");
        }, 1000);
    };

    return (
        <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center space-x-4">
                    <Link href="/admin" className="p-2 rounded-full hover:bg-gray-100 transition-colors">
                        <ArrowLeft size={20} className="text-gray-600" />
                    </Link>
                    <h1 className="text-2xl font-bold text-gray-900">Edit News Item</h1>
                </div>
                <div className="flex items-center space-x-3">
                    <button className="flex items-center space-x-2 px-4 py-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors">
                        <Save size={18} />
                        <span>Save Draft</span>
                    </button>
                    <button
                        onClick={handlePublish}
                        className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-accent text-white hover:bg-amber-800 transition-colors shadow-sm"
                    >
                        <Send size={18} />
                        <span>Approve & Publish</span>
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 space-y-6">
                {/* Title */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                    <input
                        type="text"
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all font-serif text-lg"
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Category */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                        <select
                            value={formData.category}
                            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                            className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                        >
                            <option value="Society">Society (사회)</option>
                            <option value="Economy">Economy (경제)</option>
                            <option value="Culture">Culture (문화)</option>
                            <option value="Politics">Politics (정치)</option>
                            <option value="International">International (국제)</option>
                            <option value="Korea-Vietnam">Korea-Vietnam (한-베)</option>
                            <option value="Community">Community (교민)</option>
                            <option value="Travel">Travel (여행)</option>
                            <option value="Health">Health (건강)</option>
                            <option value="Food">Food (음식)</option>
                            <option value="Other">Other (기타)</option>
                        </select>
                    </div>

                    {/* Image URL */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
                        <input
                            type="text"
                            value={formData.imageUrl}
                            onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                            className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                        />
                    </div>
                </div>

                {/* Summary */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Summary (for Social Media)</label>
                    <textarea
                        value={formData.summary}
                        onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                        rows={3}
                        className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all resize-none"
                    />
                    <p className="text-xs text-gray-500 mt-1 text-right">0 / 280 characters</p>
                </div>

                {/* Content */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Full Content</label>
                    <textarea
                        value={formData.content}
                        onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                        rows={15}
                        className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all font-serif"
                    />
                </div>
            </div>

            <div className="mt-8 flex justify-end">
                <button className="flex items-center space-x-2 px-4 py-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors">
                    <Trash2 size={18} />
                    <span>Delete Item</span>
                </button>
            </div>
        </div>
    );
}
