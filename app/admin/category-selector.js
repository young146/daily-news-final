'use client';

import { useState } from 'react';
import { updateCategoryAction } from './actions';

export default function CategorySelector({ id, initialCategory }) {
    const [category, setCategory] = useState(initialCategory || 'Society');
    const [loading, setLoading] = useState(false);

    const handleChange = async (e) => {
        const newCategory = e.target.value;
        setCategory(newCategory);
        setLoading(true);

        const res = await updateCategoryAction(id, newCategory);
        if (!res.success) {
            alert('카테고리 업데이트 실패: ' + res.error);
            // Revert on failure
            setCategory(initialCategory);
        }
        setLoading(false);
    };

    return (
        <select
            value={category}
            onChange={handleChange}
            disabled={loading}
            className={`text-xs border rounded p-1 bg-white w-full ${loading ? 'opacity-50' : ''}`}
        >
            <option value="Society">Society (사회)</option>
            <option value="Economy">Economy (경제)</option>
            <option value="Culture">Culture (문화)</option>
            <option value="Politics">Politics (정치)</option>
            <option value="International">International (국제)</option>
            <option value="Korea-Vietnam">Korea-Vietnam (한-베)</option>
            <option value="Community">Community (교민)</option>
        </select>
    );
}
