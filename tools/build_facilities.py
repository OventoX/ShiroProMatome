# -*- coding: utf-8 -*-
"""
build_facilities.py
Scrapes and parses facility data from https://scre.swiki.jp/index.php?増築用施設
Generates app/facilities_data.js (window.SCRE_FACILITIES).
"""
import urllib.request
import re
import os
import json
from bs4 import BeautifulSoup

CACHE_FILE = os.path.join(os.path.dirname(__file__), 'cache', 'cache_facilities.html')
OUT_FILE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'app', 'facilities_data.js'))
WIKI_URL = 'https://scre.swiki.jp/index.php?%E5%A2%97%E7%AF%89%E7%94%A8%E6%96%BD%E8%A8%AD'

def get_html():
    if os.path.exists(CACHE_FILE):
        print(f"Loading HTML from cache: {CACHE_FILE}")
        with open(CACHE_FILE, 'r', encoding='utf-8') as f:
            return f.read()
    
    print(f"Fetching HTML from {WIKI_URL} ...")
    req = urllib.request.Request(WIKI_URL, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
    with urllib.request.urlopen(req, timeout=30) as resp:
        content = resp.read().decode('utf-8', errors='replace')
    with open(CACHE_FILE, 'w', encoding='utf-8') as f:
        f.write(content)
    return content

def parse_stats(effect_text):
    stats = {}
    
    # 攻撃
    m = re.search(r'攻撃\s*([+-]?\d+)', effect_text)
    if m: stats['atk'] = int(m.group(1))
    
    # 防御
    m = re.search(r'防御\s*([+-]?\d+)', effect_text)
    if m: stats['def'] = int(m.group(1))
    
    # 耐久
    m = re.search(r'耐久\s*([+-]?\d+)', effect_text)
    if m: stats['hp'] = int(m.group(1))
    
    # 射程 (例: 射程+4, 射程2)
    m = re.search(r'射程\s*([+-]?\d+)', effect_text)
    if m: stats['range'] = int(m.group(1))
    
    # 回復
    m = re.search(r'回復\s*([+-]?\d+)', effect_text)
    if m: stats['rec'] = int(m.group(1))
    
    # 初計 / 初回計略 (-10%, -3秒 等)
    m = re.search(r'(?:初計|初回計略(?:短縮)?)\s*([+-]?\d+)(%|秒)?', effect_text)
    if m:
        stats['stratInit'] = int(m.group(1))
        
    # 配気 (-2 等)
    m = re.search(r'配気\s*([+-]?\d+)', effect_text)
    if m:
        stats['cost'] = int(m.group(1))

    # 攻速 / 攻撃速度 / 高速
    m = re.search(r'(?:攻速|攻撃速度|高速)\s*([+-]?\d+)%', effect_text)
    if m:
        stats['atkSpeed'] = int(m.group(1))

    # 隙短縮
    m = re.search(r'隙短縮\s*([+-]?\d+)%', effect_text)
    if m:
        stats['gapShorten'] = int(m.group(1))

    # 再出撃
    m = re.search(r'再出撃\s*([+-]?\d+)%', effect_text)
    if m:
        stats['redeploy'] = int(m.group(1))

    return stats

def parse_restrictions(desc_text):
    # 配置
    ranges = []
    if '近接城娘のみ' in desc_text:
        ranges = ['近']
    elif '遠隔城娘のみ' in desc_text:
        ranges = ['遠']
        
    # 地形
    terrains = []
    if '平山城娘のみ' in desc_text or '平山城城娘のみ' in desc_text:
        terrains.append('平山')
    elif '平城娘のみ' in desc_text or '平城城娘のみ' in desc_text:
        terrains.append('平')
        
    if '山城娘のみ' in desc_text or '山城城娘のみ' in desc_text:
        terrains.append('山')
    if '水城娘のみ' in desc_text or '水城城娘のみ' in desc_text:
        terrains.append('水')
    if '地獄城娘のみ' in desc_text:
        terrains.append('地獄')
    if '無属性城娘のみ' in desc_text:
        terrains.append('無')

    # 武器種
    weapons = []
    for w in ['刀', '槍', '槌', '盾', '拳', '鎌', '戦棍', '双剣', 'ランス', '弓', '石弓', '鉄砲', '大砲', '歌舞', '法術', '鈴', '杖', '祓串', '本', '投剣', '鞭', '陣貝', '軍船', '茶器']:
        if f'{w}城娘のみ' in desc_text:
            weapons.append(w)
            
    # 地域
    regions = []
    for r in ['北海道・東北', '関東・甲信越', '北陸・東海', '近畿', '中国・四国', '九州・沖縄', '九州', '海外・その他']:
        if f'{r}城娘のみ' in desc_text or f'{r}城娘' in desc_text:
            regions.append(r)
            
    # 特殊タグ
    special = []
    if '絢爛城娘のみ' in desc_text:
        special.append('絢爛')
    if '兜娘のみ' in desc_text:
        special.append('兜娘')
    if '架空城娘のみ' in desc_text:
        special.append('架空')

    return {
        'ranges': ranges,
        'terrains': terrains,
        'weapons': weapons,
        'regions': regions,
        'special': special
    }

def main():
    html = get_html()
    soup = BeautifulSoup(html, 'html.parser')
    
    tables = soup.find_all('table')
    
    table_cats = {
        4: '門', 6: '堀', 8: '石垣', 10: '狭間', 12: '水源',
        14: '鯱', 16: '祠', 18: '櫓・塔', 20: '鎧兜', 22: '茶室',
        24: '庭園', 26: 'その他'
    }
    
    facilities = []
    seen = set()
    
    for t_idx, cat in table_cats.items():
        if t_idx >= len(tables):
            continue
        t = tables[t_idx]
        for row in t.find_all('tr')[1:]:
            cols = [c.get_text().strip() for c in row.find_all(['td', 'th'])]
            if len(cols) < 4:
                continue
            
            rarity_str = cols[0]
            name = cols[1]
            effect_text = cols[2]
            desc_text = cols[3]
            
            if not name or name in ['名称', '施設名', 'なし']:
                continue
            # 未確定・効果なし除外
            if not effect_text or not effect_text.strip() or '?' in effect_text or '未実装' in effect_text:
                continue
                
            m = re.search(r'([1-7])', rarity_str)
            rarity = int(m.group(1)) if m else 1
            
            key = (name, effect_text)
            if key in seen:
                continue
            seen.add(key)
            
            stats = parse_stats(effect_text)
            restrs = parse_restrictions(desc_text)
            
            # 重複判定: 鎧兜カテゴリ、または「他の施設と効果が重複」「効果が重複」の記載
            stackable = (cat == '鎧兜' or '他の施設と効果が重複' in desc_text or '効果が重複' in desc_text or '重複' in effect_text)
            
            facilities.append({
                'id': f"fac_{len(facilities) + 1}",
                'name': name,
                'rarity': rarity,
                'category': cat,
                'effectText': effect_text,
                'description': desc_text,
                'stats': stats,
                'stackable': stackable,
                'terrains': restrs['terrains'],
                'ranges': restrs['ranges'],
                'weapons': restrs['weapons'],
                'regions': restrs['regions'],
                'special': restrs['special']
            })

    print(f"Total facilities extracted: {len(facilities)}")
    
    # 統計出力
    cats_count = {}
    for f in facilities:
        cats_count[f['category']] = cats_count.get(f['category'], 0) + 1
    print("Categories count:", cats_count)
    
    stackable_count = sum(1 for f in facilities if f['stackable'])
    print(f"Stackable facilities count: {stackable_count}")
    
    with open(OUT_FILE, 'w', encoding='utf-8') as f:
        f.write('/**\n')
        f.write(' * 増築用施設データ\n')
        f.write(' * 出典: https://scre.swiki.jp/index.php?増築用施設\n')
        f.write(' */\n')
        f.write('(function() {\n')
        f.write('  window.SCRE_FACILITIES = ')
        json.dump(facilities, f, ensure_ascii=False, indent=2)
        f.write(';\n')
        f.write('})();\n')
        
    print(f"Saved {len(facilities)} facilities to {OUT_FILE}")

if __name__ == '__main__':
    main()
